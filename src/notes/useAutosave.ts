import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { api } from "@/lib/api";
import { AutosaveEngine, type AutosaveState } from "./autosave";
import { saveNoteKeepalive } from "./keepalive";

/**
 * Saves still running for notes whose editor just closed (e.g. moving from
 * the session page into the call). The next editor for the same session
 * waits for them before loading, so it starts from the latest version.
 */
const closingSaves = new Map<string, Promise<unknown>>();

export interface AutosaveHandle {
  /** Null until the note has loaded. */
  state: AutosaveState | null;
  loadError: boolean;
  setContent: (content: string) => void;
  /** Saves now; resolves true once the latest text is on the server. */
  flush: () => Promise<boolean>;
  resolveConflict: (choice: "mine" | "theirs") => Promise<void>;
}

/**
 * Your private note for one session, autosaved. Note content is kept in
 * memory only — never in localStorage — so nothing lingers on a shared
 * device.
 */
export function useAutosave(sessionId: string): AutosaveHandle {
  const { session } = useAuth();
  const accessToken = useRef<string | null>(null);
  accessToken.current = session?.access_token ?? null;

  const note = useQuery({
    queryKey: ["note", sessionId],
    queryFn: async () => {
      await closingSaves.get(sessionId);
      return api.myNote(sessionId);
    },
    // The editor owns the text once loaded; never refetch underneath it.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const engineRef = useRef<AutosaveEngine | null>(null);
  const [state, setState] = useState<AutosaveState | null>(null);

  useEffect(() => {
    if (!note.data) return;
    const engine = new AutosaveEngine(
      {
        initialContent: note.data.content,
        initialVersion: note.data.version,
        save: (content, baseVersion) => api.saveNote(sessionId, content, baseVersion),
        load: () => api.myNote(sessionId),
        isOnline: () => navigator.onLine,
      },
      setState,
    );
    engineRef.current = engine;
    setState(engine.getState());

    const onOnline = () => engine.online();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void engine.flush();
    };
    const onPageHide = () => {
      const pending = engine.pendingSave();
      if (pending && accessToken.current) {
        saveNoteKeepalive(accessToken.current, sessionId, pending.content, pending.baseVersion);
      }
    };
    // Warn before leaving only while something isn't saved yet.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (engine.getState().unsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Leaving the page inside the app: save what's left, then stop.
      const closing = engine.flush().finally(() => {
        engine.dispose();
        if (closingSaves.get(sessionId) === closing) closingSaves.delete(sessionId);
      });
      closingSaves.set(sessionId, closing);
      engineRef.current = null;
    };
  }, [note.data, sessionId]);

  const setContent = useCallback((content: string) => engineRef.current?.update(content), []);
  const flush = useCallback(async () => (engineRef.current ? engineRef.current.flush() : true), []);
  const resolveConflict = useCallback(async (choice: "mine" | "theirs") => {
    await engineRef.current?.resolveConflict(choice);
  }, []);

  return { state, loadError: note.isError, setContent, flush, resolveConflict };
}
