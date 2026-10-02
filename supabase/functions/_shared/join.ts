/**
 * Whether a participant may join right now. Pure, so the rules are unit
 * tested without a database. Non-participants never reach this point: the
 * database returns nothing for them and the function answers 404.
 */
import { ApiError } from "./http.ts";

export interface JoinInfo {
  session_id: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  room_name: string;
  opens_at: string;
  closes_at: string;
}

export function assertCanJoin(info: JoinInfo, now: number): void {
  if (info.status === "cancelled") {
    throw new ApiError(409, "SESSION_CLOSED", "This session was cancelled.");
  }
  if (info.status === "ended") {
    throw new ApiError(409, "SESSION_CLOSED", "This session has ended.");
  }
  if (now < Date.parse(info.opens_at)) {
    throw new ApiError(409, "JOIN_NOT_OPEN", "It's a little early — you can join 15 minutes before the start.", {
      opensAt: info.opens_at,
    });
  }
  if (now > Date.parse(info.closes_at)) {
    throw new ApiError(409, "SESSION_CLOSED", "This session's time has passed.");
  }
}
