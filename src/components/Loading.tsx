import { Loader2 } from "lucide-react";

export const Loading = ({ label = "Loading…" }: { label?: string }) => (
  <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </div>
);
