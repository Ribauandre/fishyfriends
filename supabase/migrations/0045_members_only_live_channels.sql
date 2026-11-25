-- The app's two live channels — who is on the dock in the game, and "someone just posted" on
-- Home — were open ones: anybody holding the site's public key could join them, watch which
-- account ids were playing and what they were doing, announce themselves under any id, and
-- open as many channels as the project's allowance would take. Nothing personal travelled on
-- them, but who is online, when, is not an outsider's business either.
--
-- Supabase Realtime has private channels: a client joins with `private: true`, and whether it
-- may listen or send is decided by row-level security on realtime.messages, with the topic
-- being joined in realtime.topic(). This file writes those rules; the app joins privately
-- from this version on (utils/liveChannels.js). A table with RLS on and no policies
-- lets nobody in, which is what realtime.messages has been until now — so nothing here opens
-- anything that was shut.
--
--   * listen:   members, on the topics the app uses (the dock, the activity feed, and one the
--               admin page joins to check that all this works);
--   * announce: members, their presence on the dock, and nothing else. Nobody may broadcast.
--
-- This does not by itself stop anyone using OPEN channels: that is a project setting, not
-- something SQL can reach. Once the crew is on this version, the owner turns off
-- "Allow public access to channels" (Supabase dashboard > Realtime > Settings); the admin page
-- says when that is safe and whether it has been done.
--
-- Any policy already on realtime.messages is dropped first, by lookup, like 0041 did for
-- storage: one made by hand is exactly the kind of drift the audit found. What is reported
-- is a count and each one's shape, never its name or text.

do $$
declare
  p record;
  dropped integer := 0;
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'live channels: this database has no realtime.messages (not a Supabase project?), nothing to do';
    return;
  end if;

  begin
    for p in
      select pol.polname as name, pol.polcmd as cmd,
        (pol.polroles = '{0}' or exists (select 1 from pg_roles r where r.oid = any (pol.polroles) and r.rolname = 'anon')) as reaches_signed_out,
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as body
      from pg_policy pol
      where pol.polrelid = 'realtime.messages'::regclass
    loop
      if p.name not in ('Members listen on the club''s channels', 'Members announce themselves on the dock') then
        raise notice 'live channels: a policy no migration made — % for %; unconditional: %',
          case p.cmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
          case when p.reaches_signed_out then 'signed-out visitors or everyone' else 'signed-in accounts' end,
          (p.body in ('true', '(true)'));
      end if;
      execute format('drop policy %I on realtime.messages', p.name);
      dropped := dropped + 1;
    end loop;

    -- On already everywhere Supabase made this table; only said if it somehow isn't, so that
    -- a role that may write policies but not alter the table isn't stopped by a no-op.
    if not (select c.relrowsecurity from pg_class c where c.oid = 'realtime.messages'::regclass) then
      alter table realtime.messages enable row level security;
    end if;

    create policy "Members listen on the club's channels" on realtime.messages for select to authenticated
      using (
        (select public.is_member())
        and (select realtime.topic()) in ('cast-and-catch-dock', 'home-activity-feed', 'club-channel-check')
        and realtime.messages.extension in ('broadcast', 'presence')
      );

    create policy "Members announce themselves on the dock" on realtime.messages for insert to authenticated
      with check (
        (select public.is_member())
        and (select realtime.topic()) = 'cast-and-catch-dock'
        and realtime.messages.extension in ('presence')
      );

    raise notice 'live channels: % earlier policies removed; members-only rules are in place', dropped;
  exception
    when insufficient_privilege then
      -- The deploy's role doesn't own this table on every Supabase project. Nothing is left
      -- half done (this block is one savepoint), the app falls back to open channels while
      -- they are allowed, and the deploy's own check says the rules are missing.
      raise notice 'live channels: this role may not manage policies on realtime.messages; add the two rules from this file in the dashboard''s SQL editor';
    when undefined_function or undefined_column then
      -- A Realtime too old (or too new) to have realtime.topic() or messages.extension: the
      -- same outcome, for a different reason.
      raise notice 'live channels: this database''s Realtime does not have what private channels are judged by (realtime.topic(), messages.extension); no rules were made';
  end;
end $$;
