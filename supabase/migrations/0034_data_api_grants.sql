-- Explicit Data API grants for every app table.
--
-- From 30 October 2026 Supabase stops granting anon / authenticated / service_role access to
-- new tables in "public" automatically; a table without grants answers the app with
-- "permission denied". Tables already in the live project keep the grants they were given
-- when they were created, so on the deployed database this file changes nothing. It is
-- here so that replaying the migrations from scratch (a new project, a preview branch,
-- `supabase db reset`) ends with the same access the live project has.
--
-- Grants only open the table to the API. Which rows anyone can see or change is still
-- decided by each table's row-level security policies, and every table below has RLS on.
--
-- Every migration that creates a table from now on grants it in the same file (see
-- CLAUDE.md); this one covers the tables made before that rule.
grant select on table
  public.profiles, public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.custom_species, public.notifications, public.bug_reports,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_profiles, public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
to anon;

grant select, insert, update, delete on table
  public.profiles, public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.custom_species, public.notifications, public.bug_reports,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_profiles, public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
to authenticated, service_role;
