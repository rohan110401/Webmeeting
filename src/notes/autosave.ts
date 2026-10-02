/**
 * Autosave engine for one note. Framework-free so its timing rules can be
 * unit tested with fake timers; useAutosave wraps it for React.
 *
 * Rules:
 * - Save 1.5 s after typing stops, and at least every 10 s while typing goes on.
 * - flush() saves immediately (blur, leaving the call, tab hidden).
 * - One request at a time; edits made during a save are saved right after it.
 * - Failures retry with backoff (1 s → 2 s → … 30 s), and at once when the
 *   browser comes back online. The text stays in memory the whole time.
 * - Every save carries the version it was based on. If another tab saved in
 *   between, the engine stops and reports a conflict, unless the server
 *   already holds exactly this text (e.g. a final save sent while the page
 *   was hiding), in which case it adopts that version silently.
 */

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "offline" | "error" | "conflict";

export interface SaveResult {
  version: number;
  updated_at: string;
}

export interface ServerNote {
  content: string;
  version: number;
}

export interface SaveError {
  code?: string;
}

export interface AutosaveOptions {
  initialContent: string;
  initialVersion: number;
  save: (content: string, baseVersion: number) => Promise<SaveResult>;
  load: () => Promise<ServerNote>;
  debounceMs?: number;
  maxWaitMs?: number;
  /** Reports whether the browser believes it is online. */
  isOnline?: () => boolean;
}

export interface AutosaveState {
  content: string;
  status: SaveStatus;
  lastSavedAt: string | null;
  /** True whenever the latest text isn't confirmed saved on the server. */
  unsaved: boolean;
}

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
/** Errors that retrying won't fix. */
const PERMANENT = new Set(["NOT_FOUND", "VALIDATION", "UNAUTHENTICATED"]);

export class AutosaveEngine {
  private content: string;
  private savedContent: string;
  private version: number;
  private status: SaveStatus;
  private lastSavedAt: string | null = null;
  private inFlight: Promise<void> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = MIN_RETRY_MS;
  private disposed = false;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;

  constructor(
    private readonly options: AutosaveOptions,
    private readonly onChange: (state: AutosaveState) => void,
  ) {
    this.content = options.initialContent;
    this.savedContent = options.initialContent;
    this.version = options.initialVersion;
    this.status = options.initialVersion > 0 ? "saved" : "idle";
    this.debounceMs = options.debounceMs ?? 1_500;
    this.maxWaitMs = options.maxWaitMs ?? 10_000;
  }

  getState(): AutosaveState {
    return {
      content: this.content,
      status: this.status,
      lastSavedAt: this.lastSavedAt,
      unsaved: this.content !== this.savedContent || this.status === "conflict",
    };
  }

  /** The editor's text changed. */
  update(content: string): void {
    if (this.disposed) return;
    this.content = content;
    if (this.status === "conflict") {
      this.emit();
      return;
    }
    if (content === this.savedContent && !this.inFlight) {
      this.clearSaveTimers();
      this.setStatus(this.version > 0 ? "saved" : "idle");
      return;
    }
    if (!this.inFlight && this.status !== "offline" && this.status !== "error") this.setStatus("dirty");
    else this.emit();

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flush(), this.debounceMs);
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => void this.flush(), this.maxWaitMs);
    }
  }

  /**
   * Saves now. Resolves true once the latest text is on the server, false if
   * it couldn't be saved (it will keep retrying in the background).
   */
  async flush(): Promise<boolean> {
    if (this.disposed) return false;
    this.clearSaveTimers();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.status === "conflict") return false;

    // Wait for the request already on its way, then save anything newer.
    while (this.inFlight) await this.inFlight;
    if (this.content === this.savedContent) {
      this.setStatus(this.version > 0 ? "saved" : "idle");
      return true;
    }

    const sending = this.content;
    const base = this.version;
    this.setStatus("saving");
    let ok = false;
    this.inFlight = (async () => {
      try {
        const result = await this.options.save(sending, base);
        this.version = result.version;
        this.savedContent = sending;
        this.lastSavedAt = result.updated_at;
        this.retryDelay = MIN_RETRY_MS;
        ok = true;
      } catch (err) {
        await this.handleFailure(err as SaveError, sending);
      }
    })();
    await this.inFlight;
    this.inFlight = null;
    if (this.disposed) return ok;

    // handleFailure may have found the text already saved (status "saved").
    const status = this.status as SaveStatus;
    if (ok || status === "saved") {
      if (this.content !== this.savedContent) {
        // Typed while saving: save the rest straight away.
        return this.flush();
      }
      this.setStatus("saved");
      return true;
    }
    this.emit();
    return false;
  }

  private async handleFailure(err: SaveError, sending: string): Promise<void> {
    if (err.code === "VERSION_CONFLICT") {
      try {
        const server = await this.options.load();
        if (server.content === sending) {
          // The server already has this text: nothing was lost.
          this.version = server.version;
          this.savedContent = sending;
          this.lastSavedAt = new Date().toISOString();
          this.status = "saved";
          return;
        }
      } catch {
        // fall through to reporting the conflict
      }
      this.status = "conflict";
      return;
    }
    if (err.code && PERMANENT.has(err.code)) {
      this.status = "error";
      return;
    }
    const online = this.options.isOnline?.() ?? true;
    this.status = online ? "error" : "offline";
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  /** The browser reports it's back online. */
  online(): void {
    if (this.status === "offline" || this.status === "error") {
      this.retryDelay = MIN_RETRY_MS;
      void this.flush();
    }
  }

  /**
   * After a conflict: keep this tab's text (saved over the newer version), or
   * take the newer text from the server.
   */
  async resolveConflict(choice: "mine" | "theirs"): Promise<void> {
    const server = await this.options.load();
    this.version = server.version;
    if (choice === "theirs") {
      this.content = server.content;
      this.savedContent = server.content;
      this.setStatus(server.version > 0 ? "saved" : "idle");
      return;
    }
    this.savedContent = server.content;
    this.status = "dirty";
    await this.flush();
  }

  /** Base version and text for a last-chance save while the page unloads. */
  pendingSave(): { content: string; baseVersion: number } | null {
    if (this.content === this.savedContent || this.status === "conflict") return null;
    return { content: this.content, baseVersion: this.version };
  }

  dispose(): void {
    this.disposed = true;
    this.clearSaveTimers();
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private clearSaveTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    this.emit();
  }

  private emit(): void {
    if (!this.disposed) this.onChange(this.getState());
  }
}
