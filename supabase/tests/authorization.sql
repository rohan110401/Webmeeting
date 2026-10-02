-- =============================================================================
-- Authorization tests: proves that one person can never read or change
-- another person's notes or sessions, through any table or function.
--
-- Runs inside one transaction and rolls back, so it leaves nothing behind.
-- Every check raises an exception on failure; the final row reads
-- "authorization tests: all passed".
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/authorization.sql
--
-- or paste the whole file into the Supabase SQL editor.
--
-- Cast: A and B are a pair. C and D are another pair. C is the outsider who
-- tries to reach A and B's data.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- -----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated',
   'a@test.invalid', '{"provider":"email"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated',
   'b@test.invalid', '{"provider":"email"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated',
   'c@test.invalid', '{"provider":"email"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated',
   'd@test.invalid', '{"provider":"email"}', now(), now());

do $$
begin
  if (select count(*) from public.profiles where id in (
        'a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b',
        'c0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000d')) <> 4 then
    raise exception 'FAIL: a profile should be created for every new account';
  end if;
end;
$$;

update public.profiles set display_name = 'Alice' where id = 'a0000000-0000-4000-8000-00000000000a';
update public.profiles set display_name = 'Bob' where id = 'b0000000-0000-4000-8000-00000000000b';
update public.profiles set display_name = 'Carol' where id = 'c0000000-0000-4000-8000-00000000000c';
update public.profiles set display_name = 'Dan' where id = 'd0000000-0000-4000-8000-00000000000d';

select set_config('test.pair_ab', private.create_pair('a@test.invalid', 'b@test.invalid', 'A+B')::text, true);
select set_config('test.pair_cd', private.create_pair('c@test.invalid', 'd@test.invalid', 'C+D')::text, true);

-- A pair holds two people, never three.
do $$
begin
  insert into public.pair_members (pair_id, user_id)
  values (current_setting('test.pair_ab')::uuid, 'c0000000-0000-4000-8000-00000000000c');
  raise exception 'FAIL: a third member was added to a pair';
exception
  when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Visitors (anon) see nothing and can call nothing.
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'pairs', 'pair_members', 'sessions', 'session_participants', 'session_notes'] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: anon can read public.%', t;
    exception
      when insufficient_privilege then null; -- expected
    end;
  end loop;

  begin
    perform public.my_sessions('upcoming');
    raise exception 'FAIL: anon can call my_sessions';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.create_session(current_setting('test.pair_ab')::uuid);
    raise exception 'FAIL: anon can call create_session';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- A creates a session with B and writes a note.
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select set_config('test.session_ab',
  public.create_session(current_setting('test.pair_ab')::uuid, now() + interval '1 day', 60, 'Weekly')::text, true);

do $$
declare
  v jsonb;
begin
  v := public.save_note(current_setting('test.session_ab')::uuid, 'Alice private note', 0);
  if (v ->> 'version')::int <> 1 then
    raise exception 'FAIL: first save should create version 1';
  end if;
  v := public.save_note(current_setting('test.session_ab')::uuid, 'Alice private note, edited', 1);
  if (v ->> 'version')::int <> 2 then
    raise exception 'FAIL: second save should bump to version 2';
  end if;

  -- A stale tab (still on version 1) is refused, not silently overwritten.
  begin
    perform public.save_note(current_setting('test.session_ab')::uuid, 'stale tab', 1);
    raise exception 'FAIL: a stale version overwrote the note';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  if (select content from public.session_notes where session_id = current_setting('test.session_ab')::uuid)
     <> 'Alice private note, edited' then
    raise exception 'FAIL: the stale save changed the note';
  end if;

  -- The room name is never readable.
  begin
    perform video_room_name from public.sessions limit 1;
    raise exception 'FAIL: video_room_name is readable through the API';
  exception
    when insufficient_privilege then null;
  end;

  -- Service-role-only functions are not callable.
  begin
    perform public.session_join_info(current_setting('test.session_ab')::uuid, 'a0000000-0000-4000-8000-00000000000a');
    raise exception 'FAIL: session_join_info is callable by a signed-in user';
  exception
    when insufficient_privilege then null;
  end;

  if (select count(*) from public.sessions) <> 1 then
    raise exception 'FAIL: A should see exactly their one session';
  end if;
  if jsonb_array_length(public.my_sessions('upcoming')) <> 1 then
    raise exception 'FAIL: my_sessions(upcoming) should list A''s session';
  end if;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- B is in the same session but must never see A's note.
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare
  v_session uuid := current_setting('test.session_ab')::uuid;
  v jsonb;
begin
  if public.get_session(v_session) is null then
    raise exception 'FAIL: B cannot see a session they take part in';
  end if;
  if (select count(*) from public.session_notes) <> 0 then
    raise exception 'FAIL: B can see A''s note';
  end if;
  if (select count(*) from public.session_notes where session_id = v_session) <> 0 then
    raise exception 'FAIL: B can see A''s note by session id';
  end if;
  if (public.my_sessions('upcoming') -> 0 ->> 'has_my_note')::boolean then
    raise exception 'FAIL: my_sessions leaks that a note exists (it is A''s, not B''s)';
  end if;

  -- B can't change A's note: updates match no rows.
  update public.session_notes set content = 'overwritten by B' where session_id = v_session;
  -- B can't name an author: author_id is not insertable through the API.
  begin
    insert into public.session_notes (session_id, author_id, content)
    values (v_session, 'a0000000-0000-4000-8000-00000000000a', 'forged');
    raise exception 'FAIL: B could insert a note with A as the author';
  exception
    when insufficient_privilege then null;
  end;
  -- Nobody can delete notes through the API.
  begin
    delete from public.session_notes where session_id = v_session;
    raise exception 'FAIL: delete on session_notes is allowed';
  exception
    when insufficient_privilege then null;
  end;

  -- B's own first save starts at version 1, separate from A's note.
  v := public.save_note(v_session, 'Bob private note', 0);
  if (v ->> 'version')::int <> 1 then
    raise exception 'FAIL: B''s first save should be version 1 of B''s own note';
  end if;
  if (select count(*) from public.session_notes) <> 1
     or (select content from public.session_notes) <> 'Bob private note' then
    raise exception 'FAIL: B should see exactly their own note';
  end if;
end;
$$;

reset role;

do $$
begin
  if (select content from public.session_notes
       where author_id = 'a0000000-0000-4000-8000-00000000000a') <> 'Alice private note, edited' then
    raise exception 'FAIL: B changed A''s note';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- C (a different pair) can reach nothing of A and B's, even with the ids.
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

do $$
declare
  v_session uuid := current_setting('test.session_ab')::uuid;
  v_pair uuid := current_setting('test.pair_ab')::uuid;
begin
  if (select count(*) from public.sessions where id = v_session) <> 0 then
    raise exception 'FAIL: C can read A+B''s session row';
  end if;
  if public.get_session(v_session) is not null then
    raise exception 'FAIL: get_session returns A+B''s session to C';
  end if;
  if (select count(*) from public.session_participants where session_id = v_session) <> 0 then
    raise exception 'FAIL: C can see who is in A+B''s session';
  end if;
  if (select count(*) from public.session_notes) <> 0 then
    raise exception 'FAIL: C can see notes';
  end if;
  if (select count(*) from public.pairs where id = v_pair) <> 0
     or (select count(*) from public.pair_members where pair_id = v_pair) <> 0 then
    raise exception 'FAIL: C can see A+B''s pair';
  end if;
  if (select count(*) from public.profiles where display_name in ('Alice', 'Bob')) <> 0 then
    raise exception 'FAIL: C can see the names of people they have never met';
  end if;
  if (select count(*) from public.profiles where display_name = 'Dan') <> 1 then
    raise exception 'FAIL: C should see their own pair partner''s name';
  end if;
  if jsonb_array_length(public.my_sessions('upcoming')) <> 0
     or jsonb_array_length(public.my_sessions('history')) <> 0 then
    raise exception 'FAIL: my_sessions shows C sessions that are not theirs';
  end if;

  -- Every write path behaves as "not found" (P0002).
  begin
    perform public.save_note(v_session, 'C was here', 0);
    raise exception 'FAIL: C could save a note into A+B''s session';
  exception when no_data_found then null;
  end;
  begin
    perform public.create_session(v_pair, now() + interval '2 days');
    raise exception 'FAIL: C could create a session in A+B''s pair';
  exception when no_data_found then null;
  end;
  begin
    perform public.cancel_session(v_session);
    raise exception 'FAIL: C could cancel A+B''s session';
  exception when no_data_found then null;
  end;
  begin
    perform public.end_session(v_session);
    raise exception 'FAIL: C could end A+B''s session';
  exception when no_data_found then null;
  end;
  begin
    insert into public.session_notes (session_id, content) values (v_session, 'direct insert');
    raise exception 'FAIL: C could insert a note directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.sessions set status = 'cancelled' where id = v_session;
    raise exception 'FAIL: sessions are directly updatable';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- Join info (service role): only participants get a room.
-- -----------------------------------------------------------------------------
do $$
declare
  v_session uuid := current_setting('test.session_ab')::uuid;
begin
  if public.session_join_info(v_session, 'c0000000-0000-4000-8000-00000000000c') is not null then
    raise exception 'FAIL: session_join_info gives an outsider a room';
  end if;
  if public.session_join_info(v_session, 'a0000000-0000-4000-8000-00000000000a') ->> 'room_name' !~ '^r_[0-9a-f]{64}$' then
    raise exception 'FAIL: room names should be long and random';
  end if;
  if public.session_join_info(gen_random_uuid(), 'a0000000-0000-4000-8000-00000000000a') is not null then
    raise exception 'FAIL: an unknown session should give nothing';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- A ends the session; it moves to history for both, notes stay editable.
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_session uuid := current_setting('test.session_ab')::uuid;
begin
  perform public.end_session(v_session);
  perform public.end_session(v_session); -- idempotent
  if jsonb_array_length(public.my_sessions('upcoming')) <> 0
     or jsonb_array_length(public.my_sessions('history')) <> 1 then
    raise exception 'FAIL: an ended session should move to history';
  end if;
  if not (public.my_sessions('history') -> 0 ->> 'has_my_note')::boolean then
    raise exception 'FAIL: history should flag that A has a note';
  end if;
  if (public.my_sessions('history') -> 0 ->> 'other_name') <> 'Bob' then
    raise exception 'FAIL: history should show the other person''s name';
  end if;
  perform public.save_note(v_session, 'Added after the session', 2);
  begin
    perform public.cancel_session(v_session);
    raise exception 'FAIL: an ended session was cancelled';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end;
$$;

reset role;

select 'authorization tests: all passed' as result;

rollback;
