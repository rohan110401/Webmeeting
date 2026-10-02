-- =============================================================================
-- Webmeeting: end-to-end encryption master secret in Vault
--
-- The video-token function derives each session's media key from a master
-- secret. A function secret (E2EE_MASTER_SECRET) wins when set; otherwise the
-- secret lives in Vault, generated here inside the database so no person ever
-- has to create, see or paste it.
-- =============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'e2ee_master_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(48), 'base64'),
      'e2ee_master_secret',
      'Master secret for per-session LiveKit E2EE keys (read by video-token)');
  end if;
end;
$$;

-- Service role only (the video-token Edge Function).
create function public.e2ee_master_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'e2ee_master_secret' limit 1;
$$;

revoke all on function public.e2ee_master_secret() from public, anon, authenticated;
grant execute on function public.e2ee_master_secret() to service_role;
