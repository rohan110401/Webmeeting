-- =============================================================================
-- Webmeeting: no function is executable by PUBLIC
--
-- Postgres grants EXECUTE on every new function to PUBLIC (which includes the
-- anon role). Per-schema default privileges can only add grants, never take
-- that one away, so the earlier migrations' revokes left it in place. The
-- functions still refused visitors (each checks auth.uid()), but visitors
-- shouldn't be able to call them at all. Revoke it explicitly, and globally
-- for anything created later.
-- =============================================================================

alter default privileges revoke execute on functions from public;

revoke execute on function public.my_sessions(text) from public, anon;
revoke execute on function public.get_session(uuid) from public, anon;
revoke execute on function public.my_pairs() from public, anon;
revoke execute on function public.create_session(uuid, timestamptz, integer, text) from public, anon;
revoke execute on function public.cancel_session(uuid) from public, anon;
revoke execute on function public.end_session(uuid) from public, anon;
revoke execute on function public.save_note(uuid, text, integer) from public, anon;

revoke execute on function private.join_opens_at(timestamptz) from public, anon;
revoke execute on function private.join_closes_at(timestamptz, integer) from public, anon;
revoke execute on function audit.block_changes() from public, anon;
