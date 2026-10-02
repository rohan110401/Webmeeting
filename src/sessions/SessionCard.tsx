import { Link } from "react-router-dom";
import { ChevronRight, NotebookPen } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { SessionListItem } from "@/lib/types";
import { formatDayWithYear, formatTime } from "@/lib/time";
import { JoinButton } from "./JoinButton";

export const SessionCard = ({ session, now }: { session: SessionListItem; now: number }) => {
  const upcoming = session.status === "scheduled" || session.status === "live";
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40">
      <Link to={`/s/${session.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{formatDayWithYear(session.scheduled_at)}</span>
          {session.status !== "scheduled" && <StatusBadge status={session.status} />}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {formatTime(session.scheduled_at)} · {session.duration_minutes} min
          {session.other_name ? ` · with ${session.other_name}` : ""}
          {session.title ? ` · ${session.title}` : ""}
        </p>
        {!upcoming && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
            {session.has_my_note ? "My notes" : "No notes"}
          </p>
        )}
      </Link>
      {upcoming ? (
        <JoinButton session={session} now={now} size="sm" />
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </li>
  );
};
