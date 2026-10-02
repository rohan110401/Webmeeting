import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Clock, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loading } from "@/components/Loading";
import { NotFound } from "@/components/NotFound";
import { StatusBadge } from "@/components/StatusBadge";
import { useNow } from "@/hooks/useNow";
import { api, ApiError } from "@/lib/api";
import { formatDayWithYear, formatDuration, formatTime } from "@/lib/time";
import { NotesEditor } from "@/notes/NotesEditor";
import { useAutosave } from "@/notes/useAutosave";
import { useUnsavedGuard } from "@/notes/useUnsavedGuard";
import { JoinButton } from "@/sessions/JoinButton";
import { joinState } from "@/sessions/joinState";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SessionPage = () => {
  const { sessionId = "" } = useParams();
  if (!UUID.test(sessionId)) return <NotFound />;
  return <SessionDetails key={sessionId} sessionId={sessionId} />;
};

const SessionDetails = ({ sessionId }: { sessionId: string }) => {
  const now = useNow();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId),
    refetchInterval: 60_000,
  });
  const notes = useAutosave(sessionId);
  useUnsavedGuard(notes);

  const cancel = useMutation({
    mutationFn: () => api.cancelSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session cancelled");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "We couldn't cancel the session."),
  });

  if (session.isLoading) return <Loading />;
  if (session.isError) {
    return <p className="py-12 text-center text-destructive">We couldn't load this session. Please refresh.</p>;
  }
  const s = session.data;
  if (!s) return <NotFound />;

  const other = s.participants.find((p) => !p.is_me);
  const state = joinState(s, now);
  const startsAt = Date.parse(s.scheduled_at);
  const canCancel = s.status === "scheduled" && now < startsAt;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            All sessions
          </Link>
        </Button>

        <section className="rounded-xl border bg-card p-6">
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge status={s.status} />
          </div>
          <h1 className="text-2xl font-semibold">{s.title || formatDayWithYear(s.scheduled_at)}</h1>
          <ul className="mt-4 space-y-2 text-sm">
            {s.title && (
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {formatDayWithYear(s.scheduled_at)}
              </li>
            )}
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {formatTime(s.scheduled_at)} · {s.duration_minutes} min
            </li>
            {other && (
              <li className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                With {other.display_name || "your partner"}
              </li>
            )}
          </ul>

          {state !== "closed" && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <JoinButton session={s} now={now} size="lg" />
              {state === "early" && (
                <p className="text-sm text-muted-foreground">
                  Starts in {formatDuration(startsAt - now)}. You can join 15 minutes before.
                </p>
              )}
            </div>
          )}

          {canCancel && (
            <div className="mt-6 border-t pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    Cancel session
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {other?.display_name || "The other person"} will see it as cancelled. Your notes are kept.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction destructive onClick={() => cancel.mutate()}>
                      Cancel session
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </section>
      </div>

      <section className="flex min-h-[420px] flex-col rounded-xl border bg-card p-6 lg:mt-12">
        <NotesEditor notes={notes} className="flex-1" />
      </section>
    </div>
  );
};

export default SessionPage;
