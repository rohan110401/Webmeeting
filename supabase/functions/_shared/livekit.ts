/**
 * LiveKit access: short-lived join tokens and room lifecycle. The API secret
 * never leaves this module's environment.
 */
import { AccessToken, RoomServiceClient, TrackSource } from "npm:livekit-server-sdk@2.19.1";

export interface LiveKitConfig {
  /** wss:// URL the browser connects to. */
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function liveKitConfig(): LiveKitConfig | null {
  const url = Deno.env.get("LIVEKIT_URL");
  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** Joins are possible for 10 minutes; LiveKit refreshes it itself during the call. */
export const TOKEN_TTL_SECONDS = 600;

/**
 * A token for exactly one room. The identity is the user's id — no name or
 * email reaches LiveKit. Camera, microphone and screen share only; no
 * recording, room admin or data publishing.
 */
export function mintJoinToken(config: LiveKitConfig, roomName: string, identity: string): Promise<string> {
  const token = new AccessToken(config.apiKey, config.apiSecret, { identity, ttl: TOKEN_TTL_SECONDS });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ],
  });
  return token.toJwt();
}

function roomService(config: LiveKitConfig): RoomServiceClient {
  return new RoomServiceClient(config.url.replace(/^ws/, "http"), config.apiKey, config.apiSecret);
}

/**
 * Creates the room with a hard cap of two participants before anyone joins.
 * Creating a room that already exists returns it unchanged.
 */
export async function ensureRoom(config: LiveKitConfig, roomName: string): Promise<void> {
  await roomService(config).createRoom({
    name: roomName,
    maxParticipants: 2,
    emptyTimeout: 10 * 60,
    departureTimeout: 5 * 60,
  });
}

/** Disconnects everyone. A room that is already gone counts as closed. */
export async function closeRoom(config: LiveKitConfig, roomName: string): Promise<void> {
  try {
    await roomService(config).deleteRoom(roomName);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    throw err;
  }
}
