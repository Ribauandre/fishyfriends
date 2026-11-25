-- How much one account can add in a day, and how many files it can keep.
--
-- Members are trusted with each other's company, not with the club's database. Until now
-- nothing bounded what one signed-in account could write: a script running as any member —
-- or as a member's stolen session — could post rows as fast as the API would take them, and
-- upload 5 MB files without end. The project is on Supabase's free plan (500 MB of database,
-- 1 GB of files); filled, it goes read-only for everybody. Notifications could be poured
-- into every member's bell the same way.
--
-- 1. A daily count per account and table, kept by the database. Every table an account can
--    insert into gets a statement-level trigger that adds the rows just inserted to that
--    account's count for the day and refuses the statement once the count passes the
--    table's limit. Deleting rows does not give the count back, so insert-and-delete in a
--    loop gets nowhere. The limits sit far above anything the app does in a day (a GPX
--    import of thousands of pins, a long session in the game) — they are there to stop a
--    runaway, not to ration anyone. A write with no signed-in account behind it (a
--    migration, the dashboard, a restore) is not counted.
--
-- 2. A ceiling on stored files per account, in the upload policy itself: so many files, so
--    many megabytes, so many new files in a day. storage_room() tells the app which one was
--    hit, because storage reports a refused upload as a bare policy error.
--
-- The counts table is not in the API: row-level security on, no policies, no grants.

-- ---------------------------------------------------------------------------
-- 1. Rows a day
-- ---------------------------------------------------------------------------
create table if not exists public.write_counts (
  user_id uuid not null,
  what text not null,
  day date not null,
  n integer not null default 0,
  primary key (user_id, what, day)
);
alter table public.write_counts enable row level security;

-- Arguments: the most rows one account may add to this table in a day; what to call them
-- when saying no; and, for a table one account could fill over time, the column that says
-- whose a row is and the most rows one account may have in it altogether.
--
-- This sits on every table the club writes to, so it must never be the reason a catch can't
-- be logged: anything that goes wrong in the counting itself lets the write through. Only
-- its own "that's too many" stops one. The deploy says whether the counting works on the
-- live database (run-migrations.mjs tries it on a row that is rolled back).
create or replace function public.count_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
  today date := (now() at time zone 'utc')::date;
  a_day integer := tg_argv[0]::integer;
  noun text := coalesce(tg_argv[1], 'rows');
  adding integer;
  so_far integer;
  kept bigint;
begin
  if who is null then
    return null;
  end if;
  begin
    select count(*) into adding from added;
    if adding = 0 then
      return null;
    end if;

    insert into public.write_counts as c (user_id, what, day, n) values (who, tg_table_name, today, adding)
      on conflict (user_id, what, day) do update set n = c.n + excluded.n
      returning c.n into so_far;
    if so_far > a_day then
      raise exception 'That''s more % than one account can add in a day (the limit is %). It starts again tomorrow.', noun, to_char(a_day, 'FM999,999,999')
        using errcode = 'P0001';
    end if;

    if tg_nargs >= 4 then
      execute format('select count(*) from public.%I where %I = $1', tg_table_name, tg_argv[2]) into kept using who;
      if kept > tg_argv[3]::bigint then
        raise exception 'One account can keep up to % % here. Delete some you no longer need, then try again.', to_char(tg_argv[3]::bigint, 'FM999,999,999'), noun
          using errcode = 'P0001';
      end if;
    end if;

    -- The first write of the day to a table is also when this account's old counts are swept.
    if so_far = adding then
      delete from public.write_counts c where c.user_id = who and c.day < today - 14;
    end if;
  exception
    when raise_exception then
      raise;
    when others then
      return null;
  end;
  return null;
end;
$$;

do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('bug_reports',                 30, 'bug reports',      null,         null),
      ('custom_species',              60, 'species',          null,         null),
      ('personal_bests',             200, 'personal bests',   null,         null),
      ('personal_best_comments',     300, 'comments',         null,         null),
      ('fish_year_catch_comments',   300, 'comments',         null,         null),
      ('tournament_entry_comments',  300, 'comments',         null,         null),
      ('personal_best_likes',       1000, 'likes',            null,         null),
      ('fish_year_catch_likes',     1000, 'likes',            null,         null),
      ('tournament_entry_likes',    1000, 'likes',            null,         null),
      ('fish_year_catches',          200, 'catches',          null,         null),
      ('tournament_entries',         200, 'entries',          null,         null),
      ('trip_catches',               300, 'catches',          null,         null),
      ('game_catches',              4000, 'game catches',     null,         null),
      ('notifications',             3000, 'notifications',    null,         null),
      ('tournaments',                 30, 'tournaments',      null,         null),
      ('trips',                       40, 'trips',            null,         null),
      ('trip_attendees',             200, 'sign-ups',         null,         null),
      ('trip_expenses',              300, 'expenses',         null,         null),
      ('trip_settlements',           300, 'payments',         null,         null),
      ('trip_items',                 600, 'packing items',    null,         null),
      ('waypoint_maps',               40, 'maps',             null,         null),
      ('waypoint_map_members',       300, 'invitations',      null,         null),
      -- The one table a single account could fill by itself: a pin carries up to 4,000
      -- characters of notes. 10,000 a day is two of the largest chartplotter exports;
      -- 25,000 altogether is five times what a chartplotter holds.
      ('waypoints',                10000, 'waypoints',        'created_by', 25000),
      ('fishing_licenses',            40, 'licenses',         null,         null)
    ) as t (tbl, a_day, noun, owner_col, kept)
  loop
    if to_regclass('public.' || quote_ident(rule.tbl)) is null then
      raise notice 'limits: public.% is not in this database, no limit set on it', rule.tbl;
      continue;
    end if;
    execute format('drop trigger if exists count_writes on public.%I', rule.tbl);
    if rule.owner_col is null then
      execute format('create trigger count_writes after insert on public.%I referencing new table as added for each statement execute function public.count_writes(%L, %L)',
        rule.tbl, rule.a_day, rule.noun);
    else
      execute format('create trigger count_writes after insert on public.%I referencing new table as added for each statement execute function public.count_writes(%L, %L, %L, %L)',
        rule.tbl, rule.a_day, rule.noun, rule.owner_col, rule.kept);
    end if;
  end loop;
  raise notice 'limits: a daily count on % tables', (
    select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'count_writes' and not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  );
end $$;

-- ---------------------------------------------------------------------------
-- 2. Files
-- ---------------------------------------------------------------------------
-- What the signed-in account has stored, against what one account may: everything in its
-- own {account id}/ folder, in every bucket. Each bucket already refuses a file over 5 MB,
-- so a count bounds the bytes too; the byte ceiling is for the day the files are small and
-- many. A file's size is known once it is uploaded, so the ceiling is passed by at most the
-- one upload that crosses it.
--
-- Every upload asks this, so like the count above it must never be why a photo can't go up:
-- if it can't work the answer out (storage's own tables are Supabase's, and can change), it
-- says there is room and says it didn't know ('unknown'). The deploy reports which it is.
create or replace function public.storage_room()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (
  with mine as (
    select
      count(*) as files,
      coalesce(sum(case when o.metadata ->> 'size' ~ '^\d{1,15}$' then (o.metadata ->> 'size')::bigint else 0 end), 0) as bytes,
      count(*) filter (where o.created_at >= (now() at time zone 'utc')::date::timestamp at time zone 'utc') as today
    from storage.objects o
    where (storage.foldername(o.name))[1] = (select auth.uid())::text
  ), limits as (
    select 3000::bigint as file_limit, (500::bigint * 1024 * 1024) as byte_limit, 60::bigint as day_limit
  )
  select jsonb_build_object(
    'files', mine.files, 'bytes', mine.bytes, 'today', mine.today,
    'file_limit', limits.file_limit, 'byte_limit', limits.byte_limit, 'day_limit', limits.day_limit,
    'room', (mine.today < limits.day_limit and mine.files < limits.file_limit and mine.bytes < limits.byte_limit),
    'why', case
      when mine.files >= limits.file_limit or mine.bytes >= limits.byte_limit then 'full'
      when mine.today >= limits.day_limit then 'today'
    end
  )
  from mine, limits
  );
exception when others then
  return jsonb_build_object('room', true, 'why', null, 'unknown', true);
end;
$$;

do $$
begin
  revoke all on table public.write_counts from public;
  revoke all on function public.count_writes() from public;
  revoke all on function public.storage_room() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.write_counts from anon, authenticated;
    revoke all on function public.count_writes() from anon, authenticated;
    revoke all on function public.storage_room() from anon;
    grant execute on function public.storage_room() to authenticated, service_role;
  end if;
end $$;

-- The upload policy, as 0042 wrote it, with the ceiling added. Replacing a file under the
-- same name is an upload too and is held to it; deleting is never refused, so an account
-- that is full can always make room.
do $$
begin
  drop policy if exists "Members upload into their own folder" on storage.objects;
  create policy "Members upload into their own folder" on storage.objects for insert to authenticated
    with check (
      (select public.is_member())
      and bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
      and (storage.foldername(name))[1] = (select auth.uid())::text
      and (select (public.storage_room() ->> 'room')::boolean)
    );
exception when insufficient_privilege then
  -- Nothing is left half done (this block is one savepoint): the policy 0042 made stays, and
  -- uploads go on working without the ceiling.
  raise notice 'limits: this role may not change the upload policy on storage.objects; uploads keep the policy they had, without a ceiling';
end $$;
