import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/Loading";
import { api, ApiError } from "@/lib/api";
import { toLocalInputValue, viewerTimeZone } from "@/lib/time";

const DURATIONS = [30, 45, 60, 90, 120];

/** The next quarter hour at least 10 minutes from now. */
function defaultStart(): Date {
  const d = new Date(Date.now() + 10 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

const NewSession = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pairs = useQuery({ queryKey: ["pairs"], queryFn: api.myPairs });
  const readyPairs = (pairs.data ?? []).filter((p) => p.member_count === 2);

  const [pairId, setPairId] = useState<string>("");
  const [when, setWhen] = useState(() => toLocalInputValue(defaultStart()));
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createSession({
        pairId: pairId || readyPairs[0].id,
        // datetime-local is wall-clock time in the viewer's zone.
        scheduledAt: new Date(when).toISOString(),
        durationMinutes: duration,
        title: title.trim() || undefined,
      }),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/s/${id}`, { replace: true });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "We couldn't create the session."),
  });

  if (pairs.isLoading) return <Loading />;
  if (readyPairs.length === 0) {
    return (
      <div className="mx-auto max-w-md py-12 text-center text-muted-foreground">
        You need to be connected with someone before you can create a session.
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) {
      setError("Please choose a date and time.");
      return;
    }
    if (at.getTime() < Date.now() - 5 * 60_000) {
      setError("Please choose a time in the future.");
      return;
    }
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-lg">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </Button>
      <h1 className="mb-6 text-2xl font-semibold">New session</h1>
      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6" noValidate>
        {readyPairs.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="pair">With</Label>
            <select
              id="pair"
              value={pairId || readyPairs[0].id}
              onChange={(e) => setPairId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {readyPairs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.other_name || p.label || "Unnamed"}
                </option>
              ))}
            </select>
          </div>
        )}
        {readyPairs.length === 1 && readyPairs[0].other_name && (
          <p className="text-sm text-muted-foreground">
            With <span className="font-medium text-foreground">{readyPairs[0].other_name}</span>
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="when">Date and time</Label>
          <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          <p className="text-xs text-muted-foreground">Your time zone: {viewerTimeZone().replace(/_/g, " ")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="duration">Length</Label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} minutes` : d === 60 ? "1 hour" : `${d / 60} hours`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">Title (optional)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Weekly session"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create session"}
        </Button>
      </form>
    </div>
  );
};

export default NewSession;
