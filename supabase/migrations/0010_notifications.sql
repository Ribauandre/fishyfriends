-- Notifications: tells an angler when someone else comments on or likes a personal best
-- or Fish Year catch they posted. recipient_id is who sees it, actor_id is who triggered
-- it; actor_name and preview are snapshotted at insert time so a notification still reads
-- correctly if the actor later renames or the source content changes. Clients insert their
-- own outgoing notifications (as the actor) right after a successful like/comment, rather
-- than a trigger, so the insert check below can just require the actor to be the current
-- user and not also be the recipient (no notifying yourself).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null default 'Angler',
  type text not null check (type in ('comment', 'like')),
  target_type text not null check (target_type in ('personal_best', 'fish_year_catch')),
  target_id uuid not null,
  preview text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "Members can view their notifications" on public.notifications;
create policy "Members can view their notifications" on public.notifications for select using (auth.uid() = recipient_id);
drop policy if exists "Members can create notifications for others" on public.notifications;
create policy "Members can create notifications for others" on public.notifications for insert with check (auth.uid() = actor_id and actor_id <> recipient_id);
drop policy if exists "Members can update their notifications" on public.notifications;
create policy "Members can update their notifications" on public.notifications for update using (auth.uid() = recipient_id);
