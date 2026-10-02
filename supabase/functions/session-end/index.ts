/**
 * POST { sessionId }   (a participant of the session)
 * → { data: { ended: true } }
 *
 * Ends the session for both people: marks it ended (as the caller, so the
 * database checks they take part in it), then closes the LiveKit room so both
 * are disconnected. No new join tokens are issued afterwards.
 */
import { z } from "npm:zod@3.25.76";
import { requireUser } from "../_shared/auth.ts";
import { serviceClient, userClient } from "../_shared/db.ts";
import { unwrap } from "../_shared/errors.ts";
import { createHandler } from "../_shared/http.ts";
import { closeRoom, liveKitConfig } from "../_shared/livekit.ts";

const schema = z.object({ sessionId: z.string().uuid() });

Deno.serve(createHandler(async (body, req) => {
  const { sessionId } = schema.parse(body);
  const caller = await requireUser(req);

  // Authorization happens here, in the database, as the caller.
  unwrap(await userClient(caller.accessToken).rpc("end_session", { p_session_id: sessionId }));

  const config = liveKitConfig();
  if (config) {
    const roomName = unwrap<string | null>(await serviceClient().rpc("session_room_name", { p_session_id: sessionId }));
    if (roomName) {
      try {
        await closeRoom(config, roomName);
      } catch {
        // The session is already ended and no new tokens will be issued; the
        // room empties itself when both people leave.
        console.error("LiveKit deleteRoom failed");
      }
    }
  }

  return { ended: true };
}));
