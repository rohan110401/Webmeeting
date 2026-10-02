/**
 * Supabase clients for Edge Functions.
 *
 * serviceClient() bypasses RLS and is used only after the function has made
 * its own authorization decision. userClient() acts as the caller, so RLS and
 * auth.uid() apply exactly as they would in the browser.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export type Db = SupabaseClient;

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/**
 * Supabase provides the legacy JWT keys (SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_ANON_KEY) and, on newer projects, the new API keys as JSON maps
 * (SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS). Either works.
 */
export function apiKey(legacy: string, keyMap: string): string {
  const direct = Deno.env.get(legacy);
  if (direct) return direct;
  const raw = Deno.env.get(keyMap);
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const first = map.default ?? Object.values(map)[0];
      if (first) return first;
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(`Missing environment variable ${legacy}`);
}

let service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(env("SUPABASE_URL"), apiKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), apiKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
