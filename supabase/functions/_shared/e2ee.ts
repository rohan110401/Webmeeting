/**
 * Per-session end-to-end encryption key for LiveKit.
 *
 * Both participants derive media keys from the same shared secret, so LiveKit's
 * servers only ever relay encrypted frames. The secret is
 * HMAC-SHA256(E2EE_MASTER_SECRET, "webmeeting:e2ee:v1:" + sessionId): stable
 * for a session (both people, and every rejoin, get the same key), different
 * for every session, and never stored. It is handed only to a verified
 * participant inside the join window.
 */

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function deriveSessionKey(masterSecret: string, sessionId: string): Promise<string> {
  if (masterSecret.length < 32) {
    throw new Error("E2EE_MASTER_SECRET must be at least 32 characters");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`webmeeting:e2ee:v1:${sessionId}`));
  return base64url(new Uint8Array(mac));
}
