-- One-off reset for launching the redesign: clears out profile details, avatars,
-- personal bests, and comments so every angler starts clean and re-fills their
-- profile / re-uploads their photos. Does NOT touch auth.users, so existing
-- accounts and passwords keep working — people just land on a blank profile
-- the next time they sign in.
--
-- Run this in the Supabase SQL editor for your project (same place you ran
-- schema.sql). There is no undo once this runs.
--
-- This file only clears the database tables. Supabase blocks direct SQL deletes
-- against storage.objects (you'll get error 42501, "Direct deletion from storage
-- tables is not allowed") — to actually remove the uploaded avatar/personal-best
-- files, run `node supabase/reset-storage.mjs` instead (see that file for setup),
-- or delete the files by hand from Storage in the dashboard.

-- 1. Comments first. (This also happens automatically via ON DELETE CASCADE
--    when personal_bests are deleted in step 2, but doing it explicitly here
--    keeps the order obvious if you ever run these one at a time.)
delete from public.personal_best_comments;

-- 2. Personal bests.
delete from public.personal_bests;

-- 3. Profiles — resets everyone's display name, home water, favorite species,
--    bio, and avatar_url back to nothing.
delete from public.profiles;

-- ---------------------------------------------------------------------------
-- OPTIONAL — only uncomment this if you ALSO want to force everyone to sign
-- up again from scratch (new confirmation emails, new passwords chosen).
-- This goes further than "re-fill your profile" — it deletes the accounts
-- themselves. Leave commented out unless you're sure.
-- ---------------------------------------------------------------------------
-- delete from auth.users;
