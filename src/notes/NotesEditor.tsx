import { AlertTriangle, Check, CloudOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutosaveHandle } from "./useAutosave";
import type { SaveStatus } from "./autosave";

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "Only you can see these notes",
  dirty: "Editing…",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — will save when you're back online",
  error: "Couldn't save — retrying",
  conflict: "Changed in another tab",
};

export const SaveIndicator = ({ status }: { status: SaveStatus }) => {
  const Icon =
    status === "saving"
      ? Loader2
      : status === "saved"
        ? Check
        : status === "offline"
          ? CloudOff
          : status === "error" || status === "conflict"
            ? AlertTriangle
            : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        status === "saved" && "text-success",
        (status === "error" || status === "conflict" || status === "offline") && "text-destructive",
        (status === "idle" || status === "dirty" || status === "saving") && "text-muted-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      {Icon && <Icon className={cn("h-3.5 w-3.5", status === "saving" && "animate-spin")} aria-hidden="true" />}
      {STATUS_TEXT[status]}
    </span>
  );
};

interface NotesEditorProps {
  notes: AutosaveHandle;
  className?: string;
  /** Dark styling for the call screen. */
  tone?: "page" | "stage";
  autoFocus?: boolean;
}

/** Your private notes for a session. Presentational: the autosave state lives in useAutosave. */
export const NotesEditor = ({ notes, className, tone = "page", autoFocus }: NotesEditorProps) => {
  const { state } = notes;
  const stage = tone === "stage";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4" aria-hidden="true" />
          My private notes
        </h2>
      </div>

      {state?.status === "conflict" && (
        <div
          className={cn(
            "mb-3 rounded-lg border p-3 text-sm",
            stage ? "border-amber-500/40 bg-amber-500/10" : "border-destructive/30 bg-destructive/5",
          )}
          role="alert"
        >
          <p className="mb-2">These notes were changed in another tab or window. Which version do you want to keep?</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void notes.resolveConflict("mine")}>
              Keep this version
            </Button>
            <Button size="sm" variant="outline" onClick={() => void notes.resolveConflict("theirs")}>
              Use the other version
            </Button>
          </div>
        </div>
      )}

      {notes.loadError ? (
        <p className="text-sm text-destructive" role="alert">
          We couldn't load your notes. Check your connection and refresh.
        </p>
      ) : !state ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading your notes</span>
        </div>
      ) : (
        <textarea
          aria-label="My private notes"
          value={state.content}
          onChange={(e) => notes.setContent(e.target.value)}
          onBlur={() => void notes.flush()}
          maxLength={100_000}
          autoFocus={autoFocus}
          spellCheck
          placeholder="Type your notes here. They save automatically and only you can see them."
          className={cn(
            "min-h-0 flex-1 resize-none rounded-lg border p-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            stage
              ? "border-white/10 bg-white/5 text-white placeholder:text-white/40"
              : "border-input bg-background placeholder:text-muted-foreground",
          )}
        />
      )}

      <div className="flex min-h-8 items-center justify-between gap-2 pt-2">
        {state && <SaveIndicator status={state.status} />}
        {state && state.content.length > 90_000 && (
          <span className="text-xs text-muted-foreground">{(100_000 - state.content.length).toLocaleString()} left</span>
        )}
      </div>
    </div>
  );
};
