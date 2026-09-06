-- Backfill: creates a public.profiles row for any signed-up user who doesn't have one
-- yet. Needed because a profiles row was previously only ever created when someone
-- saved their Settings form — anyone who signed up and went straight to Fish Year or
-- logged a personal best first could post fine (those only need the auth user id) but
-- would never show up on the Anglers directory, since that page is built from
-- public.profiles. AuthContext.js's loadProfile now creates this row automatically on
-- next login, so this file only matters for whoever was already in that state before
-- that fix shipped — safe to run more than once, and a no-op once everyone has a row.

insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1), 'New angler')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
