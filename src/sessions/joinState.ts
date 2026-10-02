/** Mirrors the server's join window so buttons enable at the right moment. */
export interface JoinableSession {
  id: string;
  status: string;
  join_opens_at: string;
  join_closes_at: string;
}

export function joinState(session: JoinableSession, now: number): "open" | "early" | "closed" {
  if (session.status === "ended" || session.status === "cancelled") return "closed";
  if (now > Date.parse(session.join_closes_at)) return "closed";
  if (now < Date.parse(session.join_opens_at)) return "early";
  return "open";
}
