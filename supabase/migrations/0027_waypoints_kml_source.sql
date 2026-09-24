-- Waypoints can now also come from KML (a Google My Maps link or an uploaded .kml file),
-- so the source column accepts 'kml' alongside 'manual' and 'gpx'.
alter table public.waypoints drop constraint if exists waypoints_source_check;
alter table public.waypoints add constraint waypoints_source_check check (source in ('manual', 'gpx', 'kml'));
