-- Notifications only pointed at the post (personal best / Fish Year catch / tournament
-- entry) a like or comment happened on, not the comment itself — so tapping a "commented
-- on your X" notification could open the right post's comment thread but land you looking
-- at the whole list instead of the specific comment. comment_id snapshots which comment
-- triggered the notification (null for a like, which has no comment). No foreign key here,
-- same as target_id above it: comments live in three different tables depending on
-- target_type, so a single FK isn't possible.
alter table public.notifications add column if not exists comment_id uuid;
