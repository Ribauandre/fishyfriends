// Plays the people this app has to hold up against — a signed-out visitor with the public
// key, someone who signed up and is waiting, someone turned down, a member, another member,
// the admin — against the real policies on a real Postgres, and fails if any of them can
// read or change something they shouldn't (or can't do something the app needs).
//
// The Jest mock can't see any of this: row-level security, grants and column privileges
// only exist in the database. Run it after any migration that touches a policy or a grant:
//
//   createdb fishy_security
//   psql fishy_security -f supabase/security/stub.sql
//   DATABASE_URL=postgresql://…/fishy_security node supabase/run-migrations.mjs
//   DATABASE_URL=postgresql://…/fishy_security node supabase/security/attack-tests.mjs
//
// Every case runs in its own transaction as that role (`set local role`, with the JWT
// claims Supabase would set) and is rolled back unless marked `keep`, so cases don't lean
// on each other except where a comment says so. NEVER point this at the live database: it
// seeds people and data.

import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL to a scratch Postgres (stub.sql + migrations applied).');
  process.exit(1);
}
if (/supabase\.(co|com)/.test(connectionString)) {
  console.error('That looks like a Supabase project. This script seeds test people and data; run it on a scratch database only.');
  process.exit(1);
}

const ADMIN = '11111111-1111-1111-1111-111111111111';
const KEV = '22222222-2222-2222-2222-222222222222';
const NEWBIE = '33333333-3333-3333-3333-333333333333'; // signed up, waiting
const MIA = '44444444-4444-4444-4444-444444444444';
const GONE = '55555555-5555-5555-5555-555555555555'; // was a member, removed

const PB1 = 'a0000000-0000-0000-0000-000000000001';
const FY_KEV = 'a0000000-0000-0000-0000-000000000002';
const FY_MIA = 'a0000000-0000-0000-0000-000000000003';
const TOURNAMENT = 'a0000000-0000-0000-0000-000000000004';
const ENTRY = 'a0000000-0000-0000-0000-000000000005';
const MAP_KEV = 'a0000000-0000-0000-0000-000000000006';
const MAP_MIA = 'a0000000-0000-0000-0000-000000000007'; // Mia's secret spots: nobody is invited
const INVITE_MIA = 'a0000000-0000-0000-0000-000000000008'; // Mia, pending, on Kev's map
const TRIP_CREW = 'a0000000-0000-0000-0000-000000000009'; // admin's trip; Kev is on it
const TRIP_MIA = 'a0000000-0000-0000-0000-00000000000a'; // Mia's trip; only Mia
const ITEM_FREE = 'a0000000-0000-0000-0000-00000000000b';
const ITEM_ADMINS = 'a0000000-0000-0000-0000-00000000000c';
const NOTE_KEV = 'a0000000-0000-0000-0000-00000000000d';
const COMMENT_MIA = 'a0000000-0000-0000-0000-00000000000e';

const APP_TABLES = [
  'profiles', 'personal_bests', 'personal_best_comments', 'personal_best_likes',
  'fish_year_catches', 'fish_year_catch_comments', 'fish_year_catch_likes',
  'custom_species', 'notifications', 'bug_reports',
  'tournaments', 'tournament_entries', 'tournament_entry_comments', 'tournament_entry_likes',
  'game_profiles', 'game_catches', 'fishing_licenses',
  'waypoint_maps', 'waypoint_map_members', 'waypoints',
  'trips', 'trip_attendees', 'trip_expenses', 'trip_settlements', 'trip_items', 'trip_catches',
  'payment_contacts',
];

const SEED = `
  insert into auth.users (id, email) values
    ('${ADMIN}', 'owner@example.test'), ('${KEV}', 'kev@example.test'), ('${NEWBIE}', 'newbie@example.test'),
    ('${MIA}', 'mia@example.test'), ('${GONE}', 'gone@example.test')
  on conflict (id) do nothing;
  insert into public.profiles (id, display_name, venmo_handle) values
    ('${ADMIN}', 'Owner', 'owner-v'), ('${KEV}', 'Kev', 'kev-v'), ('${MIA}', 'Mia', ''), ('${GONE}', 'Gone', '')
  on conflict (id) do nothing;
  delete from public.profiles where id = '${NEWBIE}';

  insert into public.club_members (user_id, status, is_admin) values
    ('${ADMIN}', 'approved', true), ('${KEV}', 'approved', false), ('${MIA}', 'approved', false), ('${GONE}', 'declined', false)
  on conflict (user_id) do update set status = excluded.status, is_admin = excluded.is_admin;
  delete from public.club_members where user_id = '${NEWBIE}';

  insert into public.personal_bests (id, user_id, species, size_label) values ('${PB1}', '${KEV}', 'Striped Bass', '30 in') on conflict (id) do nothing;
  insert into public.personal_best_comments (id, personal_best_id, user_id, author_name, body) values ('${COMMENT_MIA}', '${PB1}', '${MIA}', 'Mia', 'nice') on conflict (id) do nothing;
  insert into public.personal_best_likes (personal_best_id, user_id) values ('${PB1}', '${MIA}') on conflict do nothing;
  insert into public.fish_year_catches (id, user_id, angler_name, year, month, species) values
    ('${FY_KEV}', '${KEV}', 'Kev', 2026, 'June', 'Fluke / Flounder'), ('${FY_MIA}', '${MIA}', 'Mia', 2026, 'June', 'Bluefish')
  on conflict (id) do nothing;
  insert into public.custom_species (name) values ('Sea Robin') on conflict do nothing;
  insert into public.tournaments (id, name, starts_on, ends_on, created_by) values ('${TOURNAMENT}', 'Classic', '2026-06-01', '2026-06-30', '${ADMIN}') on conflict (id) do nothing;
  insert into public.tournament_entries (id, tournament_id, user_id, species, size) values ('${ENTRY}', '${TOURNAMENT}', '${KEV}', 'Fluke / Flounder', 22) on conflict (id) do nothing;
  insert into public.game_profiles (user_id, tackle_points) values ('${KEV}', 50) on conflict (user_id) do nothing;
  insert into public.game_catches (user_id, species, rarity) select '${KEV}', 'bluegill', 'common' where not exists (select 1 from public.game_catches);
  insert into public.fishing_licenses (user_id, state, license_number, expires_at, photo_path)
    select '${KEV}', 'New Jersey', 'NJ-123', '2027-01-01', '${KEV}/license.pdf' where not exists (select 1 from public.fishing_licenses);
  insert into public.bug_reports (user_id, body) select '${KEV}', 'it broke' where not exists (select 1 from public.bug_reports);
  insert into public.notifications (id, recipient_id, actor_id, actor_name, type, target_type, target_id) values
    ('${NOTE_KEV}', '${KEV}', '${MIA}', 'Mia', 'like', 'personal_best', '${PB1}') on conflict (id) do nothing;

  insert into public.waypoint_maps (id, owner_id, name) values ('${MAP_KEV}', '${KEV}', 'Kev''s map'), ('${MAP_MIA}', '${MIA}', 'Mia''s secret spots') on conflict (id) do nothing;
  insert into public.waypoints (map_id, created_by, name, lat, lng)
    select m, o, 'spot', 40, -74 from (values ('${MAP_KEV}'::uuid, '${KEV}'::uuid), ('${MAP_MIA}'::uuid, '${MIA}'::uuid)) v(m, o)
    where not exists (select 1 from public.waypoints);
  insert into public.waypoint_map_members (id, map_id, map_name, user_id, status, invited_by) values
    ('${INVITE_MIA}', '${MAP_KEV}', 'Kev''s map', '${MIA}', 'pending', '${KEV}') on conflict (id) do update set status = 'pending', map_id = excluded.map_id;
  delete from public.waypoint_map_members where user_id = '${KEV}';

  insert into public.trips (id, created_by, name, starts_on, ends_on) values
    ('${TRIP_CREW}', '${ADMIN}', 'Crew trip', current_date + 10, current_date + 12), ('${TRIP_MIA}', '${MIA}', 'Mia''s trip', current_date + 20, current_date + 21)
  on conflict (id) do nothing;
  insert into public.trip_attendees (trip_id, user_id) values ('${TRIP_CREW}', '${ADMIN}'), ('${TRIP_CREW}', '${KEV}'), ('${TRIP_MIA}', '${MIA}') on conflict do nothing;
  insert into public.trip_expenses (trip_id, paid_by, description, amount_cents)
    select t, p, 'gas', 4000 from (values ('${TRIP_CREW}'::uuid, '${ADMIN}'::uuid), ('${TRIP_MIA}'::uuid, '${MIA}'::uuid)) v(t, p)
    where not exists (select 1 from public.trip_expenses);
  insert into public.trip_items (id, trip_id, name, created_by, claimed_by, claimed_by_name) values
    ('${ITEM_FREE}', '${TRIP_CREW}', 'Cooler', '${ADMIN}', null, ''), ('${ITEM_ADMINS}', '${TRIP_CREW}', 'Net', '${ADMIN}', '${ADMIN}', 'Owner')
  on conflict (id) do update set claimed_by = excluded.claimed_by, claimed_by_name = excluded.claimed_by_name, name = excluded.name, trip_id = excluded.trip_id;
  insert into public.payment_contacts (user_id, zelle, apple_cash_phone) values
    ('${ADMIN}', 'owner@example.test', '+15550000001'), ('${KEV}', '+15550000002', ''), ('${MIA}', 'mia@example.test', '+15550000004')
  on conflict (user_id) do nothing;

  insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
  delete from storage.objects;
  insert into storage.objects (bucket_id, name) values
    ('avatars', '${KEV}/avatar.jpg'), ('avatars', '${MIA}/avatar.jpg'), ('fishing-licenses', '${KEV}/license.pdf'),
    ('fish-year-catches', '${MIA}/bluefish.jpg'), ('photos', 'old/legacy.jpg');
`;

const DENIED = { error: '42501' };
const rows = (count) => ({ rows: count });
const select = (table) => `select * from public.${table}`;

const cases = [];
const add = (who, name, sql, expect, options = {}) => cases.push({ who, name, sql, expect, ...options });

// --- Signed out: the public key and nothing else -------------------------------------------
for (const table of [...APP_TABLES, 'club_members']) add('anon', `reads ${table}`, select(table), DENIED);
add('anon', 'gets the sign-in page totals', 'select public.club_stats()', rows(1));
for (const call of [
  'public.my_membership()', 'public.is_member()', 'public.is_admin()', `public.is_club_member('${KEV}')`,
  'public.list_club_accounts()', `public.set_club_membership('${NEWBIE}', 'approved')`,
  `public.is_waypoint_map_collaborator('${MAP_MIA}', '${MIA}')`, `public.is_trip_member('${TRIP_CREW}', '${KEV}')`,
  `public.shares_trip_with('${KEV}', '${ADMIN}')`,
]) add('anon', `calls ${call.replace(/\(.*/, '')}`, `select * from ${call}`, DENIED);
add('anon', 'logs a catch', `insert into public.fish_year_catches (user_id, year, month, species) values ('${KEV}', 2026, 'June', 'Cod')`, DENIED);
add('anon', 'deletes catches', 'delete from public.fish_year_catches', DENIED);
add('anon', 'lists stored files', 'select * from storage.objects', rows(0));
add('anon', 'lists buckets', 'select * from storage.buckets', rows(0));
add('anon', 'uploads a file', `insert into storage.objects (bucket_id, name) values ('avatars', '${KEV}/x.jpg')`, DENIED);
add('anon', 'overwrites a file', `update storage.objects set metadata = '{}'`, rows(0));
add('anon', 'makes the license bucket public', `update storage.buckets set public = true where id = 'fishing-licenses'`, rows(0));

// --- Signed up, not approved yet ------------------------------------------------------------
add(NEWBIE, 'is told they are waiting', `select public.my_membership() ->> 'status' as status`, { value: 'pending' });
for (const table of APP_TABLES) add(NEWBIE, `sees nothing in ${table}`, select(table), rows(0));
add(NEWBIE, 'creates their own profile', `insert into public.profiles (id, display_name) values ('${NEWBIE}', 'Newbie') returning id`, rows(1), { keep: true });
add(NEWBIE, 'sees only their own profile', select('profiles'), rows(1));
add(NEWBIE, 'saves their own profile the way the app does (upsert)', `insert into public.profiles (id, display_name) values ('${NEWBIE}', 'Newbie') on conflict (id) do update set display_name = excluded.display_name`, rows(1));
add(NEWBIE, 'edits their own profile', `update public.profiles set bio = 'hi' where id = '${NEWBIE}' returning id`, rows(1));
add(NEWBIE, 'cannot edit someone else\'s profile', `update public.profiles set bio = 'x' where id = '${KEV}'`, rows(0));
add(NEWBIE, 'cannot approve themselves', `select public.set_club_membership('${NEWBIE}', 'approved')`, DENIED);
add(NEWBIE, 'cannot write the member list', `insert into public.club_members (user_id, status) values ('${NEWBIE}', 'approved')`, DENIED);
add(NEWBIE, 'cannot read the member list', 'select * from public.club_members', DENIED);
add(NEWBIE, 'cannot see the admin\'s account list', 'select * from public.list_club_accounts()', DENIED);
add(NEWBIE, 'cannot log a catch', `insert into public.fish_year_catches (user_id, year, month, species) values ('${NEWBIE}', 2026, 'June', 'Cod')`, DENIED);
add(NEWBIE, 'cannot join a trip', `insert into public.trip_attendees (trip_id, user_id) values ('${TRIP_CREW}', '${NEWBIE}')`, DENIED);
add(NEWBIE, 'cannot notify a member', `insert into public.notifications (recipient_id, actor_id, type, target_type, target_id) values ('${KEV}', '${NEWBIE}', 'like', 'personal_best', '${PB1}')`, DENIED);
add(NEWBIE, 'cannot add a species', `insert into public.custom_species (name) values ('Spam')`, DENIED);
add(NEWBIE, 'cannot upload', `insert into storage.objects (bucket_id, name) values ('avatars', '${NEWBIE}/avatar.jpg')`, DENIED);
add(NEWBIE, 'sees no stored files', 'select * from storage.objects', rows(0));

// --- Removed from the club -------------------------------------------------------------------
add(GONE, 'is told they were turned down', `select public.my_membership() ->> 'status' as status`, { value: 'declined' });
for (const table of APP_TABLES.filter((name) => name !== 'profiles')) add(GONE, `sees nothing in ${table}`, select(table), rows(0));
add(GONE, 'sees only their own profile', select('profiles'), rows(1));
add(GONE, 'cannot log a catch', `insert into public.fish_year_catches (user_id, year, month, species) values ('${GONE}', 2026, 'June', 'Cod')`, DENIED);

// --- A member: everything the app does ------------------------------------------------------
add(KEV, 'is a member, not an admin', `select (public.my_membership() ->> 'status') || '/' || (public.my_membership() ->> 'is_admin') as status`, { value: 'approved/false' });
add(KEV, 'sees the members on the roster, not people waiting or removed', select('profiles'), rows(3));
add(KEV, 'sees the board', select('fish_year_catches'), rows(2));
add(KEV, 'logs a catch and reads it back', `insert into public.fish_year_catches (user_id, angler_name, year, month, species) values ('${KEV}', 'Kev', 2026, 'July', 'Cod') returning id`, rows(1));
add(KEV, 'saves a personal best', `insert into public.personal_bests (user_id, species) values ('${KEV}', 'Cod') returning id`, rows(1));
add(KEV, 'edits their personal best', `update public.personal_bests set size_label = '31 in' where id = '${PB1}' returning id`, rows(1));
add(KEV, 'comments and reads it back', `insert into public.personal_best_comments (personal_best_id, user_id, author_name, body) values ('${PB1}', '${KEV}', 'Kev', 'ty') returning id`, rows(1));
add(KEV, 'likes a catch', `insert into public.fish_year_catch_likes (catch_id, user_id) values ('${FY_MIA}', '${KEV}')`, rows(1));
add(KEV, 'saves their profile (upsert)', `insert into public.profiles (id, display_name, bio) values ('${KEV}', 'Kev', 'hi') on conflict (id) do update set display_name = excluded.display_name, bio = excluded.bio`, rows(1));
add(KEV, 'saves game progress (upsert)', `insert into public.game_profiles (user_id, tackle_points) values ('${KEV}', 60) on conflict (user_id) do update set tackle_points = excluded.tackle_points`, rows(1));
add(KEV, 'saves payment details (upsert)', `insert into public.payment_contacts (user_id, zelle) values ('${KEV}', '+15550000009') on conflict (user_id) do update set zelle = excluded.zelle`, rows(1));
add(KEV, 'registers a species twice without error', `insert into public.custom_species (name) values ('Sea Robin') on conflict (name) do nothing`, rows(0));
add(KEV, 'starts a tournament', `insert into public.tournaments (name, starts_on, ends_on, created_by) values ('Mine', '2026-07-01', '2026-07-02', '${KEV}') returning id`, rows(1));
add(KEV, 'enters a tournament', `insert into public.tournament_entries (tournament_id, user_id, species, size) values ('${TOURNAMENT}', '${KEV}', 'Cod', 10) returning id`, rows(1));
add(KEV, 'starts a trip', `insert into public.trips (created_by, name, starts_on, ends_on) values ('${KEV}', 'Mine', current_date, current_date) returning id`, rows(1));
add(KEV, 'makes a map', `insert into public.waypoint_maps (owner_id, name) values ('${KEV}', 'New') returning id`, rows(1));
add(KEV, 'drops a pin on their map', `insert into public.waypoints (map_id, created_by, lat, lng) values ('${MAP_KEV}', '${KEV}', 40, -74) returning id`, rows(1));
add(KEV, 'adds a license', `insert into public.fishing_licenses (user_id, state, expires_at) values ('${KEV}', 'New York', '2027-01-01') returning id`, rows(1));
add(KEV, 'reports a bug', `insert into public.bug_reports (user_id, body) values ('${KEV}', 'again') returning id`, rows(1));
add(KEV, 'notifies Mia', `insert into public.notifications (recipient_id, actor_id, type, target_type, target_id) values ('${MIA}', '${KEV}', 'like', 'fish_year_catch', '${FY_MIA}')`, rows(1));
add(KEV, 'marks their notification read', `update public.notifications set read = true where id = '${NOTE_KEV}'`, rows(1));
add(KEV, 'uploads into their own folder', `insert into storage.objects (bucket_id, name) values ('fish-year-catches', '${KEV}/cod.jpg') returning id`, rows(1));
add(KEV, 'sees only their own stored files', 'select * from storage.objects', rows(2));

// A member against other members
add(KEV, 'cannot post as Mia', `insert into public.fish_year_catches (user_id, year, month, species) values ('${MIA}', 2026, 'June', 'Cod')`, DENIED);
add(KEV, 'cannot delete Mia\'s catch', `delete from public.fish_year_catches where id = '${FY_MIA}'`, rows(0));
add(KEV, 'cannot delete Mia\'s comment', `delete from public.personal_best_comments where id = '${COMMENT_MIA}'`, rows(0));
add(KEV, 'cannot rewrite a catch (no updates on the board)', `update public.fish_year_catches set species = 'Marlin' where id = '${FY_KEV}'`, DENIED);
add(KEV, 'cannot edit Mia\'s profile', `update public.profiles set display_name = 'x' where id = '${MIA}'`, rows(0));
add(KEV, 'cannot read Mia\'s notifications', `select * from public.notifications where recipient_id = '${MIA}'`, rows(0));
add(KEV, 'cannot send a notification as Mia', `insert into public.notifications (recipient_id, actor_id, type, target_type, target_id) values ('${ADMIN}', '${MIA}', 'like', 'personal_best', '${PB1}')`, DENIED);
add(KEV, 'cannot rewrite a notification they received', `update public.notifications set preview = 'send money', actor_name = 'Owner' where id = '${NOTE_KEV}'`, DENIED);
add(MIA, 'cannot see Kev\'s license', select('fishing_licenses'), rows(0));
add(ADMIN, 'cannot see Kev\'s license either', select('fishing_licenses'), rows(0));
add(MIA, 'cannot see Kev\'s bug report', select('bug_reports'), rows(0));
add(KEV, 'cannot upload into Mia\'s folder', `insert into storage.objects (bucket_id, name) values ('avatars', '${MIA}/x.jpg')`, DENIED);
add(KEV, 'cannot overwrite Mia\'s photo', `update storage.objects set metadata = '{}' where name like '${MIA}/%'`, rows(0));
add(KEV, 'cannot upload into the legacy bucket', `insert into storage.objects (bucket_id, name) values ('photos', '${KEV}/x.jpg')`, DENIED);
add(KEV, 'cannot see the admin\'s account list', 'select * from public.list_club_accounts()', DENIED);
add(KEV, 'cannot approve anyone', `select public.set_club_membership('${NEWBIE}', 'approved')`, DENIED);
add(KEV, 'cannot read the member list table', 'select * from public.club_members', DENIED);

// Waypoint maps: nobody without an accepted invitation, however they try
add(KEV, 'cannot see Mia\'s map', `select * from public.waypoint_maps where id = '${MAP_MIA}'`, rows(0));
add(KEV, 'cannot see Mia\'s waypoints', `select * from public.waypoints where map_id = '${MAP_MIA}'`, rows(0));
add(KEV, 'cannot invite themselves to Mia\'s map', `insert into public.waypoint_map_members (map_id, user_id, invited_by) values ('${MAP_MIA}', '${KEV}', '${KEV}')`, DENIED);
add(KEV, 'cannot add someone to their own map already accepted', `insert into public.waypoint_map_members (map_id, user_id, invited_by, status) values ('${MAP_KEV}', '${ADMIN}', '${KEV}', 'accepted')`, DENIED);
// The takeover 0042 closed: a row of your own (here an invite to your own map), repointed.
add(KEV, 'invites themselves to their own map', `insert into public.waypoint_map_members (map_id, user_id, invited_by) values ('${MAP_KEV}', '${KEV}', '${KEV}') returning id`, rows(1), { keep: true });
add(KEV, 'cannot repoint that row at Mia\'s map', `update public.waypoint_map_members set map_id = '${MAP_MIA}', status = 'accepted' where user_id = '${KEV}'`, DENIED);
add(KEV, 'still cannot see Mia\'s waypoints', `select * from public.waypoints where map_id = '${MAP_MIA}'`, rows(0));
add(MIA, 'cannot see Kev\'s waypoints while her invite is pending', `select * from public.waypoints where map_id = '${MAP_KEV}'`, rows(0));
add(MIA, 'cannot rename the map on her invite', `update public.waypoint_map_members set map_name = 'x' where id = '${INVITE_MIA}'`, DENIED);
add(MIA, 'accepts her invitation and reads it back', `update public.waypoint_map_members set status = 'accepted' where id = '${INVITE_MIA}' returning id`, rows(1), { keep: true });
add(MIA, 'now sees Kev\'s waypoints', `select * from public.waypoints where map_id = '${MAP_KEV}'`, rows(1));
add(KEV, 'removes Mia from the map', `delete from public.waypoint_map_members where id = '${INVITE_MIA}'`, rows(1), { keep: true });
add(MIA, 'is out again, and cannot walk back in', `insert into public.waypoint_map_members (map_id, user_id, invited_by, status) values ('${MAP_KEV}', '${MIA}', '${MIA}', 'accepted')`, DENIED);
add(MIA, 'no longer sees Kev\'s waypoints', `select * from public.waypoints where map_id = '${MAP_KEV}'`, rows(0));

// Trips and money
add(KEV, 'sees the expenses of the trip they are on, not Mia\'s', select('trip_expenses'), rows(1));
add(KEV, 'cannot add an expense to a trip they are not on', `insert into public.trip_expenses (trip_id, paid_by, description, amount_cents) values ('${TRIP_MIA}', '${KEV}', 'fake', 500000)`, DENIED);
add(KEV, 'cannot add an expense in someone else\'s name', `insert into public.trip_expenses (trip_id, paid_by, description, amount_cents) values ('${TRIP_CREW}', '${ADMIN}', 'fake', 500000)`, DENIED);
add(KEV, 'adds what they paid', `insert into public.trip_expenses (trip_id, paid_by, description, amount_cents) values ('${TRIP_CREW}', '${KEV}', 'bait', 1200) returning id`, rows(1));
add(KEV, 'records paying the admin back', `insert into public.trip_settlements (trip_id, from_user, to_user, amount_cents, created_by) values ('${TRIP_CREW}', '${KEV}', '${ADMIN}', 2000, '${KEV}') returning id`, rows(1));
add(KEV, 'cannot record a payment with someone not on the trip', `insert into public.trip_settlements (trip_id, from_user, to_user, amount_cents, created_by) values ('${TRIP_CREW}', '${KEV}', '${MIA}', 2000, '${KEV}')`, DENIED);
add(KEV, 'cannot record a payment between two other people', `insert into public.trip_settlements (trip_id, from_user, to_user, amount_cents, created_by) values ('${TRIP_CREW}', '${ADMIN}', '${MIA}', 2000, '${KEV}')`, DENIED);
add(KEV, 'sees how to pay people they share a trip with, and nobody else', select('payment_contacts'), rows(2));
add(KEV, 'cannot change the admin\'s payment details', `update public.payment_contacts set zelle = 'thief@example.test' where user_id = '${ADMIN}'`, rows(0));
add(KEV, 'claims an unclaimed item and reads it back', `update public.trip_items set claimed_by = '${KEV}', claimed_by_name = 'Kev' where id = '${ITEM_FREE}' returning id`, rows(1));
add(KEV, 'cannot take the admin\'s claim', `update public.trip_items set claimed_by = null, claimed_by_name = '' where id = '${ITEM_ADMINS}'`, rows(0));
add(KEV, 'cannot claim an item for someone else', `update public.trip_items set claimed_by = '${ADMIN}' where id = '${ITEM_FREE}'`, DENIED);
add(KEV, 'cannot rename a packing item', `update public.trip_items set name = 'x' where id = '${ITEM_FREE}'`, DENIED);
add(KEV, 'cannot move a packing item to another trip', `update public.trip_items set trip_id = '${TRIP_MIA}' where id = '${ITEM_FREE}'`, DENIED);
add(MIA, 'cannot see a packing list of a trip she is not on', select('trip_items'), rows(0));
add(MIA, 'joins the crew trip and reads it back', `insert into public.trip_attendees (trip_id, user_id, angler_name) values ('${TRIP_CREW}', '${MIA}', 'Mia') returning id`, rows(1));
add(MIA, 'cannot sign Kev up for her trip', `insert into public.trip_attendees (trip_id, user_id) values ('${TRIP_MIA}', '${KEV}')`, DENIED);
add(KEV, 'cannot log a catch to a trip they are not on', `insert into public.trip_catches (trip_id, user_id, species) values ('${TRIP_MIA}', '${KEV}', 'Cod')`, DENIED);
add(KEV, 'logs a catch to their trip', `insert into public.trip_catches (trip_id, user_id, species) values ('${TRIP_CREW}', '${KEV}', 'Cod') returning id`, rows(1));
add(KEV, 'cannot edit the admin\'s trip', `update public.trips set name = 'x' where id = '${TRIP_CREW}'`, rows(0));

// --- The admin ---------------------------------------------------------------------------------
add(ADMIN, 'is the admin', `select public.my_membership() ->> 'is_admin' as status`, { value: 'true' });
add(ADMIN, 'sees every account and where it stands', 'select * from public.list_club_accounts()', rows(5));
add(ADMIN, 'sees who is waiting', `select * from public.list_club_accounts() where status = 'pending'`, rows(1));
add(ADMIN, 'sees every bug report', select('bug_reports'), rows(1));
add(ADMIN, 'cannot change their own membership', `select public.set_club_membership('${ADMIN}', 'declined')`, { error: '22023' });
add(ADMIN, 'cannot set a made-up status', `select public.set_club_membership('${NEWBIE}', 'admin')`, { error: '22023' });
add(ADMIN, 'lists stored photos but not licenses', 'select * from storage.objects', rows(4));
add(ADMIN, 'cannot touch a license file', `update storage.objects set metadata = '{}' where bucket_id = 'fishing-licenses'`, rows(0));
add(ADMIN, 'rewrites a stored photo in place (metadata clean-up)', `update storage.objects set metadata = '{"clean":true}' where bucket_id = 'photos' returning id`, rows(1));
add(ADMIN, 'cannot move a photo into the license bucket', `update storage.objects set bucket_id = 'fishing-licenses' where bucket_id = 'photos'`, DENIED);
add(ADMIN, 'approves the newcomer', `select public.set_club_membership('${NEWBIE}', 'approved')`, rows(1), { keep: true });
add(NEWBIE, 'is in: sees the board', select('fish_year_catches'), rows(2));
add(NEWBIE, 'is in: logs a catch', `insert into public.fish_year_catches (user_id, year, month, species) values ('${NEWBIE}', 2026, 'June', 'Cod') returning id`, rows(1));
add(KEV, 'now sees the newcomer on the roster', select('profiles'), rows(4));
add(ADMIN, 'removes Kev', `select public.set_club_membership('${KEV}', 'declined')`, rows(1), { keep: true });
add(KEV, 'is out: sees nothing', select('fish_year_catches'), rows(0));
add(KEV, 'is out: cannot post', `insert into public.fish_year_catches (user_id, year, month, species) values ('${KEV}', 2026, 'June', 'Cod')`, DENIED);
add(KEV, 'is out: cannot read their old files', 'select * from storage.objects', rows(0));
add(MIA, 'no longer sees Kev on the roster', `select * from public.profiles where id = '${KEV}'`, rows(0));

// --- The catalog: nothing left open by a grant ------------------------------------------------
add('postgres', 'anon holds no privilege on any table in public', `select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`, rows(0));
add('postgres', 'no policy in public is for anon or for everyone', `select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and (pol.polroles = '{0}' or exists (select 1 from pg_roles r where r.oid = any (pol.polroles) and r.rolname = 'anon'))`, rows(0));
add('postgres', 'anon can call club_stats and no other owner-rights function', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'club_stats'`, rows(0));
add('postgres', 'every owner-rights function pins its search_path', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting where setting like 'search_path=%')`, rows(0));
add('postgres', 'storage has exactly the six policies the migrations made', `select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage'`, rows(6));
add('postgres', 'the license bucket is private and takes images and PDFs up to 5 MB', `select 1 from storage.buckets where id = 'fishing-licenses' and not public and file_size_limit = 5242880 and allowed_mime_types @> array['application/pdf']`, rows(1));

async function run() {
  const client = new pg.Client({ connectionString, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } });
  await client.connect();
  let failed = 0;
  try {
    await client.query(SEED);
    for (const test of cases) {
      const label = `${{ anon: 'signed out', postgres: 'catalog', [ADMIN]: 'admin', [KEV]: 'Kev', [MIA]: 'Mia', [NEWBIE]: 'newcomer', [GONE]: 'removed' }[test.who]}: ${test.name}`;
      let outcome;
      await client.query('begin');
      try {
        if (test.who !== 'postgres') {
          const role = test.who === 'anon' ? 'anon' : 'authenticated';
          const claims = test.who === 'anon' ? { role: 'anon' } : { sub: test.who, role: 'authenticated' };
          await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
          await client.query(`set local role ${role}`);
        }
        const result = await client.query(test.sql);
        outcome = { rows: result.rowCount, value: result.rows?.[0] ? Object.values(result.rows[0])[0] : undefined };
      } catch (error) {
        outcome = { error: error.code, message: error.message };
      }
      await client.query(test.keep && !outcome.error ? 'commit' : 'rollback');
      const passed = test.expect.error ? outcome.error === test.expect.error
        : test.expect.value !== undefined ? !outcome.error && String(outcome.value) === test.expect.value
        : !outcome.error && outcome.rows === test.expect.rows;
      if (!passed) {
        failed += 1;
        console.log(`FAIL  ${label}\n      expected ${JSON.stringify(test.expect)}, got ${JSON.stringify(outcome)}`);
      } else if (process.env.VERBOSE) {
        console.log(`ok    ${label}`);
      }
    }
  } finally {
    await client.end();
  }
  console.log(failed ? `${failed} of ${cases.length} security checks FAILED.` : `All ${cases.length} security checks passed.`);
  process.exit(failed ? 1 : 0);
}

run().catch((error) => { console.error(error.message); process.exit(1); });
