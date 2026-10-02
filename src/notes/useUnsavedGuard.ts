import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import type { AutosaveHandle } from "./useAutosave";

/**
 * Asks before navigating away inside the app while notes can't be saved
 * (offline, failing, or in conflict). Ordinary pending saves don't block:
 * leaving the page flushes them. Closing or reloading the tab is covered by
 * the beforeunload warning in useAutosave.
 */
export function useUnsavedGuard(notes: AutosaveHandle) {
  const status = notes.state?.status;
  const stuck = Boolean(notes.state?.unsaved) && (status === "offline" || status === "error" || status === "conflict");
  const blocker = useBlocker(stuck);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Your latest notes haven't been saved yet. Leave anyway and lose them?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
