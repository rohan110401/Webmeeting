import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, LogOut, MonitorSmartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NotFound } from "@/components/NotFound";
import { api, ApiError } from "@/lib/api";
import { formatDayWithYear, formatTime } from "@/lib/time";
import { NotesEditor } from "@/notes/NotesEditor";
import { useAutosave } from "@/notes/useAutosave";
import { useUnsavedGuard } from "@/notes/useUnsavedGuard";
import { InCall } from "./InCall";
import { PreJoin } from "./PreJoin";
import { useCallRoom } from "./useCallRoom";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CallPage = () => {
  const { sessionId = "" } = useParams();
  if (!UUID.test(sessionId)) return <NotFound />;
  return <Call key={sessionId} sessionId={sessionId} />;
};

const Call = ({ sessionId }: { sessionId: string }) => {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => api.getSession(sessionId) });
  const notes = useAutosave(sessionId);
  useUnsavedGuard(notes);
  const call = useCallRoom(sessionId);
  const connectedAt = useRef<number | null>(null);

  const s = session.data;
  const other = s?.participants.find((p) => !p.is_me);
  const otherName = other?.display_name || "the other person";
  const names = useMemo(
    () => Object.fromEntries((s?.participants ?? []).map((p) => [p.user_id, p.is_me ? "You" : p.display_name || "Guest"])),
    [s],
  );

  const phase = call.phase.kind;
  const flushNotes = notes.flush;
  useEffect(() => {
    if (phase === "connected") connectedAt.current ??= Date.now();
    // Whoever ended it, make sure the latest notes are saved and lists refresh.
    if (phase === "ended" || phase === "left") {
      void flushNotes();
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    }
  }, [phase, flushNotes, queryClient, sessionId]);

  if (session.isLoading) {
    return (
      <Dark>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-label="Loading" />
        </div>
      </Dark>
    );
  }
  if (!s) return <NotFound />;

  const title = `${s.title ? `${s.title} · ` : ""}with ${otherName}`;

  if (call.phase.kind === "connected" && call.room) {
    const startedAt = s.started_at ? Math.min(Date.parse(s.started_at), Date.now()) : (connectedAt.current ?? Date.now());
    return (
      <InCall
        room={call.room}
        title={title}
        otherName={otherName}
        names={names}
        startedAt={startedAt}
        endsAt={Date.parse(s.scheduled_at) + s.duration_minutes * 60_000}
        notes={notes}
        onLeave={async () => {
          await notes.flush();
          await call.leave();
        }}
        onEnd={async () => {
          await notes.flush();
          try {
            await api.endSession(sessionId);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "We couldn't end the session. Please try again.");
            return;
          }
          await call.markEnded();
        }}
      />
    );
  }

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="text-white/70 hover:bg-white/10 hover:text-white">
      <Link to={`/s/${sessionId}`}>
        <ArrowLeft aria-hidden="true" />
        Session details
      </Link>
    </Button>
  );

  if (call.phase.kind === "ended" || call.phase.kind === "left" || call.phase.kind === "replaced") {
    const ended = call.phase.kind === "ended";
    return (
      <Dark header={backLink}>
        <div className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-4 py-8 md:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            {ended ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-400" aria-hidden="true" />
            ) : call.phase.kind === "replaced" ? (
              <MonitorSmartphone className="h-10 w-10 text-white/60" aria-hidden="true" />
            ) : (
              <LogOut className="h-10 w-10 text-white/60" aria-hidden="true" />
            )}
            <h1 className="text-2xl font-semibold">
              {ended
                ? "The session has ended"
                : call.phase.kind === "replaced"
                  ? "You joined from another tab or device"
                  : "You left the call"}
            </h1>
            <p className="text-white/60">
              {ended
                ? "Your notes are saved. You can keep editing them here or any time from your previous sessions."
                : "The session is still open. You can rejoin while it lasts."}
            </p>
            <div className="flex flex-wrap gap-3">
              {!ended && <Button onClick={() => call.backToLobby()}>Rejoin</Button>}
              <Button variant="outline" asChild className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to="/">All sessions</Link>
              </Button>
            </div>
          </div>
          <div className="flex min-h-[360px] flex-col rounded-2xl bg-stage-tile p-4">
            <NotesEditor notes={notes} tone="stage" className="flex-1" />
          </div>
        </div>
      </Dark>
    );
  }

  const error = call.phase.kind === "error" ? call.phase : null;
  const closed = s.status === "ended" || s.status === "cancelled";
  return (
    <Dark header={backLink}>
      <div className="flex flex-1 items-center">
        {closed ? (
          <div className="mx-auto max-w-md px-4 text-center">
            <h1 className="text-2xl font-semibold">
              {s.status === "cancelled" ? "This session was cancelled" : "This session has ended"}
            </h1>
            <Button asChild className="mt-6">
              <Link to={`/s/${sessionId}`}>View my notes</Link>
            </Button>
          </div>
        ) : (
          <PreJoin
            title={title.charAt(0).toUpperCase() + title.slice(1)}
            subtitle={`${formatDayWithYear(s.scheduled_at)}, ${formatTime(s.scheduled_at)} · ${s.duration_minutes} min`}
            busy={call.phase.kind === "connecting"}
            error={error?.message}
            onJoin={(choices) => void call.join(choices)}
          />
        )}
      </div>
    </Dark>
  );
};

/** Full-height dark frame for the call screens. */
const Dark = ({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex min-h-dvh flex-col bg-stage text-white">
    {header && <div className="px-3 py-2">{header}</div>}
    {children}
  </div>
);

export default CallPage;
