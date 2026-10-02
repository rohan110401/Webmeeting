import { Link } from "react-router-dom";
import { Video } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { formatDuration } from "@/lib/time";
import { joinState, type JoinableSession } from "./joinState";

/** Enabled from 15 minutes before the start; the server enforces the same window. */
export const JoinButton = ({
  session,
  now,
  size = "default",
}: {
  session: JoinableSession;
  now: number;
  size?: ButtonProps["size"];
}) => {
  const state = joinState(session, now);
  if (state === "closed") return null;
  if (state === "early") {
    return (
      <Button size={size} variant="outline" disabled title="You can join 15 minutes before the start">
        <Video aria-hidden="true" />
        Opens in {formatDuration(Date.parse(session.join_opens_at) - now)}
      </Button>
    );
  }
  return (
    <Button size={size} asChild>
      <Link to={`/s/${session.id}/call`}>
        <Video aria-hidden="true" />
        Join
      </Link>
    </Button>
  );
};
