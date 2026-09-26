-- Waypoint map invites reach the bell, instead of waiting for the invitee to happen to open
-- Waypoints. The notification points at the map; the invitee can't read the map until they
-- accept, so tapping it opens the Waypoints page where the invite is.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'like', 'trip_join', 'trip_expense', 'map_invite'));
alter table public.notifications drop constraint if exists notifications_target_type_check;
alter table public.notifications add constraint notifications_target_type_check
  check (target_type in ('personal_best', 'fish_year_catch', 'tournament_entry', 'trip', 'waypoint_map'));
