-- Creating a map failed with "new row violates row-level security policy" for its own owner.
-- An insert that returns the new row (what the client's .insert().select() does) must also
-- pass the table's SELECT policy, and 0025's only checked is_waypoint_map_collaborator(),
-- which looks the map up in waypoint_maps — and that lookup can't see the row being
-- inserted by the same statement. Checking owner_id on the row itself passes for the owner.
drop policy if exists "Owners and accepted collaborators can view a waypoint map" on public.waypoint_maps;
create policy "Owners and accepted collaborators can view a waypoint map" on public.waypoint_maps for select
  using (auth.uid() = owner_id or public.is_waypoint_map_collaborator(id, auth.uid()));
