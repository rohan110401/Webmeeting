import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { useProfile } from "@/auth/useProfile";
import { useNow } from "@/hooks/useNow";
import { api, ApiError } from "@/lib/api";
import type { SessionListItem } from "@/lib/types";
import { formatMonth } from "@/lib/time";
import { SessionCard } from "@/sessions/SessionCard";

function groupByMonth(sessions: SessionListItem[]): [string, SessionListItem[]][] {
  const groups = new Map<string, SessionListItem[]>();
  for (const s of sessions) {
    const key = formatMonth(s.scheduled_at);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()];
}

const Home = () => {
  const navigate = useNavigate();
  const now = useNow();
  const profile = useProfile();
  const pairs = useQuery({ queryKey: ["pairs"], queryFn: api.myPairs });
  const upcoming = useQuery({
    queryKey: ["sessions", "upcoming"],
    queryFn: () => api.mySessions("upcoming"),
    refetchInterval: 60_000,
  });
  const history = useQuery({ queryKey: ["sessions", "history"], queryFn: () => api.mySessions("history") });

  const readyPairs = (pairs.data ?? []).filter((p) => p.member_count === 2);

  const startNow = useMutation({
    mutationFn: () => api.createSession({ pairId: readyPairs[0].id }),
    onSuccess: (id) => navigate(`/s/${id}/call`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "We couldn't start a session."),
  });

  if (pairs.isLoading || upcoming.isLoading) return <Loading />;

  const firstName = profile.data?.display_name.split(" ")[0];
  const next = upcoming.data?.[0];

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{firstName ? `Hi, ${firstName}` : "Your sessions"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {readyPairs.length === 1 && readyPairs[0].other_name
              ? `Sessions with ${readyPairs[0].other_name}`
              : "Upcoming and previous sessions"}
          </p>
        </div>
        {readyPairs.length > 0 && (
          <div className="flex gap-2">
            {readyPairs.length === 1 && (
              <Button variant="outline" onClick={() => startNow.mutate()} disabled={startNow.isPending}>
                <Zap aria-hidden="true" />
                {startNow.isPending ? "Starting…" : "Start now"}
              </Button>
            )}
            <Button asChild>
              <Link to="/s/new">
                <CalendarPlus aria-hidden="true" />
                New session
              </Link>
            </Button>
          </div>
        )}
      </div>

      {pairs.data && readyPairs.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-medium">You're not connected with anyone yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sessions happen between two connected people. Ask whoever runs this app to connect your account.
          </p>
        </div>
      )}

      {next && next.status === "live" && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-4 text-sm">
          A session is in progress{next.other_name ? ` with ${next.other_name}` : ""}.
        </div>
      )}

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.isError ? (
          <p className="text-sm text-destructive">We couldn't load your sessions. Please refresh.</p>
        ) : upcoming.data && upcoming.data.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.data.map((s) => (
              <SessionCard key={s.id} session={s} now={now} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No upcoming sessions.</p>
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Previous sessions
        </h2>
        {history.isLoading ? (
          <Loading />
        ) : history.data && history.data.length > 0 ? (
          <div className="space-y-6">
            {groupByMonth(history.data).map(([month, sessions]) => (
              <div key={month}>
                <h3 className="mb-2 text-sm font-medium">{month}</h3>
                <ul className="space-y-2">
                  {sessions.map((s) => (
                    <SessionCard key={s.id} session={s} now={now} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Past sessions and your notes from them will appear here.
          </p>
        )}
      </section>
    </div>
  );
};

export default Home;
