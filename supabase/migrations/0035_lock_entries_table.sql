-- Close public.entries to the Data API.
--
-- The live project has a table called "entries" that no migration created and no version of
-- the app has ever read or written (it predates the tournaments tables, most likely made by
-- hand in the dashboard). It had row-level security off and the old automatic grants, so
-- anyone holding the site's public key could read, change or delete its rows; Supabase's
-- security advisor flagged it (rls_disabled_in_public, 17 October 2026).
--
-- RLS on with no policies shuts out anon and authenticated entirely, and the grants go too.
-- The rows are kept: whether the table should be dropped is the owner's call. On a project
-- replayed from these migrations the table doesn't exist, and this does nothing.
do $$
begin
  if to_regclass('public.entries') is not null then
    alter table public.entries enable row level security;
    revoke all on table public.entries from anon, authenticated;
  end if;
end $$;
