/**
 * POST { sessionId }   (a participant of the session, inside its join window)
 * → { data: { serverUrl, token, e2eeKey, identity, closesAt } }
 *
 * The only way into a call. Anyone who isn't a participant gets the same 404
 * as for a session that doesn't exist.
 */
import { z } from "npm:zod@3.25.76";
import { requireUser } from "../_shared/auth.ts";
import { serviceClient } from "../_shared/db.ts";
import { deriveSessionKey } from "../_shared/e2ee.ts";
import { unwrap } from "../_shared/errors.ts";
import { ApiError, createHandler } from "../_shared/http.ts";
import { assertCanJoin, type JoinInfo } from "../_shared/join.ts";
import { ensureRoom, liveKitConfig, mintJoinToken } from "../_shared/livekit.ts";

const schema = z.object({ sessionId: z.string().uuid() });

const NOT_CONFIGURED = new ApiError(
  503,
  "VIDEO_NOT_CONFIGURED",
  "Video isn't set up yet. Please contact whoever runs this app.",
);

Deno.serve(createHandler(async (body, req) => {
  const { sessionId } = schema.parse(body);
  const caller = await requireUser(req);
  const db = serviceClient();

  const info = unwrap<JoinInfo | null>(
    await db.rpc("session_join_info", { p_session_id: sessionId, p_user_id: caller.userId }),
  );
  if (!info) throw new ApiError(404, "NOT_FOUND", "We couldn't find that session.");
  assertCanJoin(info, Date.now());

  const config = liveKitConfig();
  const master = Deno.env.get("E2EE_MASTER_SECRET");
  // Fail closed: no call without end-to-end encryption.
  if (!config || !master || master.length < 32) throw NOT_CONFIGURED;

  try {
    await ensureRoom(config, info.room_name);
  } catch {
    console.error("LiveKit createRoom failed");
    throw new ApiError(502, "VIDEO_UNAVAILABLE", "We couldn't reach the video service. Please try again.");
  }

  const [token, e2eeKey] = await Promise.all([
    mintJoinToken(config, info.room_name, caller.userId),
    deriveSessionKey(master, info.session_id),
  ]);

  unwrap(await db.rpc("record_join", { p_session_id: info.session_id, p_user_id: caller.userId }));

  return { serverUrl: config.url, token, e2eeKey, identity: caller.userId, closesAt: info.closes_at };
}));
