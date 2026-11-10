-- Profiles are for members, and the sign-in page gets its numbers from a count.
--
-- Until now "Members can view profiles" was `using (true)` for every role, and anon had the
-- Data API grant, so anyone holding the site's public key (it is in the bundle) could read
-- every member's display name, home water and Venmo handle without signing in. Nothing
-- signed out needs a profile: the app is behind sign-in, and the only signed-out page is
-- the sign-in page itself. So the read is for signed-in members only, and anon loses the
-- grant as well, so the API refuses the table outright rather than answering with no rows.
--
-- The sign-in page used to show a fixed "08 anglers" and "2025 season". It now calls
-- club_stats(), which hands anyone the totals and nothing else: how many anglers there
-- are, how many Fish Year fish have been logged this year, and which year that is. It is
-- security definer so it can count rows the caller can't read, and returns no row data.

drop policy if exists "Members can view profiles" on public.profiles;
create policy "Members can view profiles" on public.profiles for select to authenticated using (true);
revoke select on table public.profiles from anon;

create or replace function public.club_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'anglers', (select count(*) from public.profiles),
    'fish', (select count(*) from public.fish_year_catches where year = extract(year from now())::int),
    'year', extract(year from now())::int
  );
$$;

revoke all on function public.club_stats() from public;
grant execute on function public.club_stats() to anon, authenticated, service_role;
