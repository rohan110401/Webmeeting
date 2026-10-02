/**
 * Last-chance save while the page unloads. A keepalive request survives the
 * page going away, but browsers cap its body at 64 KB, so very long notes
 * rely on the regular saves (which run every 1.5–10 s anyway).
 */
const MAX_KEEPALIVE_BYTES = 60_000;

export function saveNoteKeepalive(
  accessToken: string,
  sessionId: string,
  content: string,
  baseVersion: number,
): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) return false;

  const body = JSON.stringify({ p_session_id: sessionId, p_content: content, p_base_version: baseVersion });
  if (new TextEncoder().encode(body).length > MAX_KEEPALIVE_BYTES) return false;

  fetch(`${url}/rest/v1/rpc/save_note`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // Nothing more can be done while the page is going away.
  });
  return true;
}
