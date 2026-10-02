import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False when the build has no Supabase settings; the app shows a setup notice. */
export const supabaseConfigured = Boolean(url && key);

// Both values are public by design: Supabase enforces access with Row Level
// Security, never by keeping the publishable key secret.
export const supabase = createClient(url ?? "http://localhost:54321", key ?? "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
