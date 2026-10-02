import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { deriveSessionKey } from "../_shared/e2ee.ts";
import { ApiError, isAllowedOrigin } from "../_shared/http.ts";
import { assertCanJoin, type JoinInfo } from "../_shared/join.ts";
import { mintJoinToken, TOKEN_TTL_SECONDS } from "../_shared/livekit.ts";

const MASTER = "test-master-secret-that-is-long-enough-0123456789";

function decodePayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(base64));
}

function info(overrides: Partial<JoinInfo> = {}): JoinInfo {
  const now = Date.now();
  return {
    session_id: "6f2c1d3e-0000-4000-8000-000000000001",
    status: "scheduled",
    room_name: "r_" + "a".repeat(64),
    opens_at: new Date(now - 60_000).toISOString(),
    closes_at: new Date(now + 3_600_000).toISOString(),
    ...overrides,
  };
}

function apiErrorCode(fn: () => void): string {
  const err = assertThrows(fn, ApiError);
  return (err as ApiError).code;
}

Deno.test("join: open window lets a participant in", () => {
  assertCanJoin(info(), Date.now());
  assertCanJoin(info({ status: "live" }), Date.now());
});

Deno.test("join: too early is refused with the opening time", () => {
  const opensAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const err = assertThrows(() => assertCanJoin(info({ opens_at: opensAt }), Date.now()), ApiError) as ApiError;
  assertEquals(err.code, "JOIN_NOT_OPEN");
  assertEquals(err.details?.opensAt, opensAt);
});

Deno.test("join: ended, cancelled and expired sessions are closed", () => {
  assertEquals(apiErrorCode(() => assertCanJoin(info({ status: "ended" }), Date.now())), "SESSION_CLOSED");
  assertEquals(apiErrorCode(() => assertCanJoin(info({ status: "cancelled" }), Date.now())), "SESSION_CLOSED");
  const closesAt = new Date(Date.now() - 1000).toISOString();
  assertEquals(apiErrorCode(() => assertCanJoin(info({ closes_at: closesAt }), Date.now())), "SESSION_CLOSED");
});

Deno.test("token: one room, the user's id, camera/mic/screen only, short-lived", async () => {
  const jwt = await mintJoinToken(
    { url: "wss://example.livekit.cloud", apiKey: "APIkey", apiSecret: "secret-secret-secret-secret-secret" },
    "r_room",
    "user-123",
  );
  const claims = decodePayload(jwt);
  const video = claims.video as Record<string, unknown>;

  assertEquals(claims.sub, "user-123");
  assertEquals(claims.iss, "APIkey");
  assertEquals(claims.name, undefined, "no display name reaches LiveKit");
  assertEquals((claims.exp as number) - (claims.nbf as number), TOKEN_TTL_SECONDS);
  assertEquals(video.room, "r_room");
  assertEquals(video.roomJoin, true);
  assertEquals(video.canPublishData, false);
  assertEquals(video.roomAdmin, undefined);
  assertEquals(video.roomCreate, undefined);
  assertEquals(video.roomRecord, undefined);
  assertEquals(video.canPublishSources, ["camera", "microphone", "screen_share", "screen_share_audio"]);
});

Deno.test("e2ee: same key for both people in a session, different across sessions", async () => {
  const a = await deriveSessionKey(MASTER, "session-1");
  const b = await deriveSessionKey(MASTER, "session-1");
  const c = await deriveSessionKey(MASTER, "session-2");
  assertEquals(a, b);
  assertNotEquals(a, c);
  assert(/^[A-Za-z0-9_-]{43}$/.test(a), "256-bit base64url key");
  assertNotEquals(a, await deriveSessionKey(MASTER + "x", "session-1"));
});

Deno.test("e2ee: a short master secret is refused", async () => {
  await assertRejects(() => deriveSessionKey("too-short", "session-1"));
});

Deno.test("cors: exact origins and single-label wildcards only", () => {
  const patterns = ["https://meet.example.com", "https://*--webmeeting.netlify.app"];
  assert(isAllowedOrigin("https://meet.example.com", patterns));
  assert(isAllowedOrigin("https://deploy-preview-3--webmeeting.netlify.app", patterns));
  assert(!isAllowedOrigin("https://evil.com", patterns));
  assert(!isAllowedOrigin("https://a.b--webmeeting.netlify.app", patterns));
  assert(!isAllowedOrigin("https://meet.example.com.evil.com", patterns));
});
