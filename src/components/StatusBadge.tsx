import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/lib/types";

const LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  live: "In progress",
  ended: "Ended",
  cancelled: "Cancelled",
};

const STYLES: Record<SessionStatus, string> = {
  scheduled: "bg-secondary text-secondary-foreground",
  live: "bg-success/15 text-success",
  ended: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export const StatusBadge = ({ status, className }: { status: SessionStatus; className?: string }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STYLES[status], className)}>
    {status === "live" && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />}
    {LABELS[status]}
  </span>
);
