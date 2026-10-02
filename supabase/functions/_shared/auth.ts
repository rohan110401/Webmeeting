/**
 * Caller identity. The access token is verified with Supabase Auth before
 * anything in it is trusted.
 */
import { serviceClient } from "./db.ts";
import { ApiError } from "./http.ts";

export interface Caller {
  userId: string;
  accessToken: string;
}

export function bearerToken(req: Request): string | null {
  const match = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export async function requireUser(req: Request): Promise<Caller> {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.");

  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Your session has ended. Please sign in again.");
  }
  return { userId: data.user.id, accessToken: token };
}
