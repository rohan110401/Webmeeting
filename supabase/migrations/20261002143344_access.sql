-- =============================================================================
-- Webmeeting: access control
--
-- Deny by default. Every grant below is backed by a policy or a function that
-- checks the caller. Identity always comes from the verified JWT
-- (auth.uid()); ids passed by the browser are only lookup keys. Anything the
-- caller may not see behaves exactly like something that does not exist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER so policies can consult membership
-- tables without recursing into those tables' own policies; each one only
-- answers a question about the caller.
-- -----------------------------------------------------------------------------

create function private.is_session_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_participants sp
     where sp.session_id = p_session_id and sp.user_id = (select auth.uid())
  );
$$;

create function private.is_pair_member(p_pair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pair_members pm
     where pm.pair_id = p_pair_id and pm.user_id = (select auth.uid())
  );
$$;

-- True when the caller and p_user_id are (or were) in a pair or a session
-- together: the only people whose display name the caller may see.
create function private.knows_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1 from public.pair_members a
          join public.pair_members b on b.pair_id = a.pair_id
         where a.user_id = (select auth.uid()) and b.user_id = p_user_id)
      or exists (
        select 1 from public.session_participants a
          join public.session_participants b on b.session_id = a.session_id
         where a.user_id = (select auth.uid()) and b.user_id = p_user_id);
$$;

-- Functions are created executable by PUBLIC; take that back everywhere and
-- grant only what policies need.
revoke execute on all functions in schema private from public;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema audit revoke execute on functions from public;

grant usage on schema private to authenticated;
grant execute on function private.is_session_participant(uuid) to authenticated;
grant execute on function private.is_pair_member(uuid) to authenticated;
grant execute on function private.knows_user(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Tables: RLS on everything, grants column by column.
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_notes enable row level security;
alter table audit.events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- profiles: your own row, and the display names of people you meet.
grant select (id, display_name, timezone) on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (private.knows_user(id));

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- pairs / pair_members: read-only, and only pairs you belong to. Pairs are
-- created by an operator (private.create_pair), not through the API.
grant select (id, label, created_at) on public.pairs to authenticated;
grant select (pair_id, user_id, role) on public.pair_members to authenticated;

create policy pairs_select on public.pairs for select to authenticated
  using (private.is_pair_member(id));

create policy pair_members_select on public.pair_members for select to authenticated
  using (private.is_pair_member(pair_id));

-- sessions: read sessions you take part in. video_room_name is deliberately
-- not granted. All changes go through the functions below.
grant select (id, pair_id, title, scheduled_at, duration_minutes, status, created_by,
              started_at, ended_at, cancelled_at, created_at, updated_at)
  on public.sessions to authenticated;

create policy sessions_select on public.sessions for select to authenticated
  using (private.is_session_participant(id));

grant select (session_id, user_id, first_joined_at, last_joined_at) on public.session_participants to authenticated;

create policy session_participants_select on public.session_participants for select to authenticated
  using (private.is_session_participant(session_id));

-- session_notes: strictly your own. There is no policy, for any command, that
-- matches another person's note, and no DELETE at all. The API can insert only
-- (session_id, content): author_id defaults to auth.uid() and cannot be named.
grant select (id, session_id, author_id, content, version, created_at, updated_at)
  on public.session_notes to authenticated;
grant insert (session_id, content) on public.session_notes to authenticated;
grant update (content) on public.session_notes to authenticated;

create policy session_notes_select_own on public.session_notes for select to authenticated
  using (author_id = (select auth.uid()) and private.is_session_participant(session_id));

create policy session_notes_insert_own on public.session_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_session_participant(session_id));

create policy session_notes_update_own on public.session_notes for update to authenticated
  using (author_id = (select auth.uid()) and private.is_session_participant(session_id))
  with check (author_id = (select auth.uid()) and private.is_session_participant(session_id));

-- audit.events: no policies, no grants. Service role and SQL editor only.

-- -----------------------------------------------------------------------------
-- Session window. A session can be joined from 15 minutes before it starts
-- until an hour after its planned end (or until someone ends it).
-- -----------------------------------------------------------------------------

create function private.join_opens_at(p_scheduled_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$ select p_scheduled_at - interval '15 minutes' $$;

create function private.join_closes_at(p_scheduled_at timestamptz, p_duration_minutes integer)
returns timestamptz
language sql
stable
set search_path = ''
as $$ select p_scheduled_at + make_interval(mins => p_duration_minutes) + interval '60 minutes' $$;

grant execute on function private.join_opens_at(timestamptz) to authenticated;
grant execute on function private.join_closes_at(timestamptz, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Reads (SECURITY INVOKER: RLS above decides what comes back).
-- -----------------------------------------------------------------------------

-- 'upcoming': scheduled or live sessions that can still be joined, soonest
-- first. 'history': everything else, newest first.
create function public.my_sessions(p_scope text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by
           case when p_scope = 'upcoming' then extract(epoch from t.scheduled_at) else -extract(epoch from t.scheduled_at) end),
         '[]'::jsonb)
    from (
      select s.id, s.title, s.scheduled_at, s.duration_minutes, s.status,
             private.join_opens_at(s.scheduled_at) as join_opens_at,
             private.join_closes_at(s.scheduled_at, s.duration_minutes) as join_closes_at,
             (select p.display_name
                from public.session_participants sp
                join public.profiles p on p.id = sp.user_id
               where sp.session_id = s.id and sp.user_id <> (select auth.uid())
               limit 1) as other_name,
             exists (select 1 from public.session_notes n
                      where n.session_id = s.id and n.author_id = (select auth.uid())
                        and n.content <> '') as has_my_note
        from public.sessions s
       where case when p_scope = 'upcoming'
                  then s.status in ('scheduled', 'live')
                       and private.join_closes_at(s.scheduled_at, s.duration_minutes) > now()
                  else not (s.status in ('scheduled', 'live')
                       and private.join_closes_at(s.scheduled_at, s.duration_minutes) > now())
             end
       order by case when p_scope = 'upcoming' then s.scheduled_at end asc,
                s.scheduled_at desc
       limit 200
    ) t;
$$;

-- One session, or null when it doesn't exist or isn't yours.
create function public.get_session(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
           'id', s.id,
           'pair_id', s.pair_id,
           'title', s.title,
           'scheduled_at', s.scheduled_at,
           'duration_minutes', s.duration_minutes,
           'status', s.status,
           'started_at', s.started_at,
           'ended_at', s.ended_at,
           'created_by_me', s.created_by = (select auth.uid()),
           'join_opens_at', private.join_opens_at(s.scheduled_at),
           'join_closes_at', private.join_closes_at(s.scheduled_at, s.duration_minutes),
           'participants', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'user_id', sp.user_id,
                      'display_name', coalesce(p.display_name, ''),
                      'is_me', sp.user_id = (select auth.uid()))
                    order by sp.user_id = (select auth.uid()) desc), '[]'::jsonb)
               from public.session_participants sp
               left join public.profiles p on p.id = sp.user_id
              where sp.session_id = s.id))
    from public.sessions s
   where s.id = p_session_id;
$$;

-- The pairs you belong to, with the other member's name: what "New session"
-- offers.
create function public.my_pairs()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id,
           'label', pr.label,
           'member_count', (select count(*) from public.pair_members m where m.pair_id = pr.id),
           'other_name', (select p.display_name
                            from public.pair_members m
                            join public.profiles p on p.id = m.user_id
                           where m.pair_id = pr.id and m.user_id <> (select auth.uid())
                           limit 1))
           order by pr.created_at), '[]'::jsonb)
    from public.pairs pr;
$$;

-- -----------------------------------------------------------------------------
-- Writes. SECURITY DEFINER because the API roles hold no write grants on
-- sessions; each function checks the caller itself first.
-- -----------------------------------------------------------------------------

create function public.create_session(
  p_pair_id uuid,
  p_scheduled_at timestamptz default null,
  p_duration_minutes integer default 60,
  p_title text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_at timestamptz := coalesce(p_scheduled_at, now());
  v_title text := nullif(btrim(p_title), '');
  v_id uuid;
begin
  if v_uid is null or not exists (
    select 1 from public.pair_members where pair_id = p_pair_id and user_id = v_uid
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.pair_members where pair_id = p_pair_id) <> 2 then
    raise exception 'This pair needs two people before a session can be created.'
      using errcode = 'P0001', hint = 'PAIR_INCOMPLETE';
  end if;
  if v_at < now() - interval '5 minutes' then
    raise exception 'Please choose a time in the future.' using errcode = 'P0001', hint = 'VALIDATION';
  end if;
  if v_at > now() + interval '1 year' then
    raise exception 'Please choose a time within the next year.' using errcode = 'P0001', hint = 'VALIDATION';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 15 and 240 then
    raise exception 'Sessions last between 15 minutes and 4 hours.' using errcode = 'P0001', hint = 'VALIDATION';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'Please use a shorter title.' using errcode = 'P0001', hint = 'VALIDATION';
  end if;

  insert into public.sessions (pair_id, title, scheduled_at, duration_minutes, created_by)
  values (p_pair_id, v_title, v_at, p_duration_minutes, v_uid)
  returning id into v_id;

  insert into public.session_participants (session_id, user_id)
  select v_id, pm.user_id from public.pair_members pm where pm.pair_id = p_pair_id;

  perform audit.log(v_uid, 'session.created', 'session', v_id,
                    jsonb_build_object('scheduled_at', v_at, 'duration_minutes', p_duration_minutes));
  return v_id;
end;
$$;

create function public.cancel_session(p_session_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.session_status;
begin
  select s.status into v_status
    from public.sessions s
    join public.session_participants sp on sp.session_id = s.id and sp.user_id = v_uid
   where s.id = p_session_id
     for update of s;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'Only a session that hasn''t started can be cancelled.'
      using errcode = 'P0001', hint = 'INVALID_STATUS';
  end if;

  update public.sessions set status = 'cancelled', cancelled_at = now() where id = p_session_id;
  perform audit.log(v_uid, 'session.cancelled', 'session', p_session_id);
end;
$$;

-- Ends the session for both people. Idempotent: ending an ended session is a
-- no-op, so a retry after a dropped connection is harmless.
create function public.end_session(p_session_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.session_status;
begin
  select s.status into v_status
    from public.sessions s
    join public.session_participants sp on sp.session_id = s.id and sp.user_id = v_uid
   where s.id = p_session_id
     for update of s;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_status = 'ended' then
    return;
  end if;
  if v_status = 'cancelled' then
    raise exception 'This session was cancelled.' using errcode = 'P0001', hint = 'INVALID_STATUS';
  end if;

  update public.sessions set status = 'ended', ended_at = now() where id = p_session_id;
  perform audit.log(v_uid, 'session.ended', 'session', p_session_id);
end;
$$;

-- Autosave. SECURITY INVOKER: the note policies above are the boundary.
-- p_base_version is the version the editor last saw (0 = no note yet).
-- Returns {version, updated_at}; raises VERSION_CONFLICT when another tab
-- saved in between, with the current version in DETAIL.
create function public.save_note(p_session_id uuid, p_content text, p_base_version integer)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version integer;
  v_updated_at timestamptz;
  v_current integer;
begin
  if v_uid is null or not private.is_session_participant(p_session_id) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_content is null or char_length(p_content) > 100000 then
    raise exception 'Notes are limited to 100,000 characters.' using errcode = 'P0001', hint = 'VALIDATION';
  end if;

  if coalesce(p_base_version, 0) = 0 then
    insert into public.session_notes (session_id, content)
    values (p_session_id, p_content)
    on conflict (session_id, author_id) do nothing
    returning version, updated_at into v_version, v_updated_at;
  else
    update public.session_notes
       set content = p_content
     where session_id = p_session_id and author_id = v_uid and version = p_base_version
    returning version, updated_at into v_version, v_updated_at;
  end if;

  if v_version is null then
    select version into v_current
      from public.session_notes
     where session_id = p_session_id and author_id = v_uid;
    raise exception 'These notes were changed in another tab or window.'
      using errcode = 'P0001', hint = 'VERSION_CONFLICT', detail = coalesce(v_current, 0)::text;
  end if;

  return jsonb_build_object('version', v_version, 'updated_at', v_updated_at);
end;
$$;

grant execute on function public.my_sessions(text) to authenticated;
grant execute on function public.get_session(uuid) to authenticated;
grant execute on function public.my_pairs() to authenticated;
grant execute on function public.create_session(uuid, timestamptz, integer, text) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;
grant execute on function public.end_session(uuid) to authenticated;
grant execute on function public.save_note(uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Service role only (Edge Functions).
-- -----------------------------------------------------------------------------

-- Who may join, and the room to join. Null for anyone who isn't a participant,
-- exactly as for an unknown session; the caller turns every null into 404.
create function public.session_join_info(p_session_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'session_id', s.id,
           'status', s.status,
           'room_name', s.video_room_name,
           'opens_at', private.join_opens_at(s.scheduled_at),
           'closes_at', private.join_closes_at(s.scheduled_at, s.duration_minutes))
    from public.sessions s
    join public.session_participants sp on sp.session_id = s.id and sp.user_id = p_user_id
   where s.id = p_session_id;
$$;

-- Records that a participant was given a way in, and marks the session live.
create function public.record_join(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.session_participants
     set first_joined_at = coalesce(first_joined_at, now()), last_joined_at = now()
   where session_id = p_session_id and user_id = p_user_id;
  update public.sessions
     set status = 'live', started_at = coalesce(started_at, now())
   where id = p_session_id and status = 'scheduled';
  perform audit.log(p_user_id, 'session.join_token_issued', 'session', p_session_id);
end;
$$;

-- The room to close once end_session has succeeded for the caller.
create function public.session_room_name(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select video_room_name from public.sessions where id = p_session_id $$;

revoke all on function public.session_join_info(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_join(uuid, uuid) from public, anon, authenticated;
revoke all on function public.session_room_name(uuid) from public, anon, authenticated;
grant execute on function public.session_join_info(uuid, uuid) to service_role;
grant execute on function public.record_join(uuid, uuid) to service_role;
grant execute on function public.session_room_name(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Operator tools (SQL editor only; `private` is not exposed through the API).
-- -----------------------------------------------------------------------------

-- Pairs two existing accounts by email. Returns the pair id.
create function private.create_pair(p_email_a text, p_email_b text, p_label text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
  v_pair uuid;
begin
  select id into v_a from auth.users where lower(email) = lower(btrim(p_email_a));
  select id into v_b from auth.users where lower(email) = lower(btrim(p_email_b));
  if v_a is null or v_b is null then
    raise exception 'Both people need an account first (Authentication → Users → Add user).';
  end if;
  if v_a = v_b then
    raise exception 'A pair needs two different people.';
  end if;

  insert into public.pairs (label, created_by) values (nullif(btrim(p_label), ''), v_a) returning id into v_pair;
  insert into public.pair_members (pair_id, user_id) values (v_pair, v_a), (v_pair, v_b);
  perform audit.log(null, 'pair.created', 'pair', v_pair);
  return v_pair;
end;
$$;

revoke all on function private.create_pair(text, text, text) from public, anon, authenticated;
