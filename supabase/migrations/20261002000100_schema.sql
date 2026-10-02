-- =============================================================================
-- Webmeeting: schema
--
-- Private two-person video sessions with private, per-person notes.
-- Access rules live in 20261002000200_access.sql; this file only creates
-- objects, and nothing here is reachable through the API until that file
-- grants it.
-- =============================================================================

-- Nothing created from here on is exposed to the API roles by default. Every
-- table and function is granted explicitly, next to the policy that backs it.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- `private` holds authorization helpers and admin-only functions. It is not an
-- exposed API schema; signed-in users get USAGE only so RLS policies can call
-- the helpers.
create schema if not exists private;
revoke all on schema private from public;

-- `audit` is append-only and never reachable through the API.
create schema if not exists audit;
revoke all on schema audit from public;

create type public.session_status as enum ('scheduled', 'live', 'ended', 'cancelled');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Random, unguessable LiveKit room name (two v4 UUIDs, ~244 random bits).
create function private.new_room_name()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'r_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- -----------------------------------------------------------------------------
-- People
-- -----------------------------------------------------------------------------

-- One row per account; contact details stay in auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Two people who meet. Sessions are always created within a pair, so nobody
-- needs a directory of other users to start one.
create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  label text check (char_length(label) <= 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pairs_set_updated_at
before update on public.pairs
for each row execute function private.set_updated_at();

create table public.pair_members (
  pair_id uuid not null references public.pairs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  created_at timestamptz not null default now(),
  primary key (pair_id, user_id)
);

create index pair_members_user_idx on public.pair_members (user_id, pair_id);

-- V1 is strictly two people. Lifting this cap (and the room's
-- maxParticipants) is the path to group sessions.
create function private.enforce_pair_size()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize concurrent inserts into the same pair.
  perform 1 from public.pairs where id = new.pair_id for update;
  if (select count(*) from public.pair_members where pair_id = new.pair_id) >= 2 then
    raise exception 'A pair has at most two members.' using errcode = 'P0001', hint = 'PAIR_FULL';
  end if;
  return new;
end;
$$;

create trigger pair_members_max_two
before insert on public.pair_members
for each row execute function private.enforce_pair_size();

-- -----------------------------------------------------------------------------
-- Sessions
-- -----------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs (id) on delete restrict,
  title text check (char_length(title) <= 120),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  status public.session_status not null default 'scheduled',
  -- Never readable through the API (see column grants); only the video-token
  -- function hands it to LiveKit.
  video_room_name text not null unique default private.new_room_name(),
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_pair_scheduled_idx on public.sessions (pair_id, scheduled_at desc);

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function private.set_updated_at();

-- Who is in a session. Copied from the pair when the session is created, so
-- access to a past session never changes if the pair changes later.
create table public.session_participants (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_joined_at timestamptz,
  last_joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index session_participants_user_idx on public.session_participants (user_id, session_id);

-- -----------------------------------------------------------------------------
-- Private notes: one document per person per session.
-- -----------------------------------------------------------------------------

create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  -- Always the signed-in user: the API can't even name another author
  -- (see column grants), and RLS checks it again.
  author_id uuid not null default auth.uid(),
  content text not null default '' check (char_length(content) <= 100000),
  -- Optimistic lock for autosave from more than one tab; bumped by trigger.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, author_id),
  -- A note can only exist for someone who is a participant of that session.
  foreign key (session_id, author_id)
    references public.session_participants (session_id, user_id) on delete cascade
);

create function private.bump_note_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  -- Identity and placement of a note never change.
  new.id := old.id;
  new.session_id := old.session_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger session_notes_bump_version
before update on public.session_notes
for each row execute function private.bump_note_version();

-- -----------------------------------------------------------------------------
-- Audit trail: what happened, never what was written.
-- -----------------------------------------------------------------------------

create table audit.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create index audit_events_entity_idx on audit.events (entity_type, entity_id);
create index audit_events_actor_idx on audit.events (actor_id, occurred_at desc);

create function audit.block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit.events is append-only';
end;
$$;

create trigger events_append_only
before update or delete on audit.events
for each row execute function audit.block_changes();

create function audit.log(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into audit.events (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke all on function audit.log(uuid, text, text, uuid, jsonb) from public;
