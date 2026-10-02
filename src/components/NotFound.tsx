import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown for unknown sessions and for sessions that belong to someone else alike. */
export const NotFound = ({ what = "session" }: { what?: string }) => (
  <div className="mx-auto max-w-md py-20 text-center">
    <SearchX className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
    <h1 className="mb-2 text-2xl font-semibold">We couldn't find that {what}</h1>
    <p className="mb-6 text-muted-foreground">
      The link may be mistyped, or it belongs to a different account. Check that you're signed in with the right email.
    </p>
    <Button asChild>
      <Link to="/">Go to my sessions</Link>
    </Button>
  </div>
);
