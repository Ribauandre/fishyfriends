-- Enables Supabase Realtime (Postgres logical replication) on the three tables that feed
-- Home's activity feed, so a new Fish Year catch, personal best, or tournament entry shows
-- up for everyone else immediately instead of only on their next page load. Each table
-- already has a public "select using (true)" policy, which Realtime's row-level-security
-- authorization uses to decide what to broadcast — this migration only adds them to the
-- replication publication so Realtime notices inserts on them at all.
--
-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form, so this checks
-- pg_publication_tables first to stay idempotent like every other migration here.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fish_year_catches'
  ) then
    alter publication supabase_realtime add table public.fish_year_catches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_bests'
  ) then
    alter publication supabase_realtime add table public.personal_bests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_entries'
  ) then
    alter publication supabase_realtime add table public.tournament_entries;
  end if;
end $$;
