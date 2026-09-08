-- Bug reports from the "Report a bug" form at the bottom of the profile page. Private by
-- design: unlike personal bests/catches, there's no reason for the rest of the crew to see
-- someone's bug report, so the select policy is scoped to the reporter's own rows (mirroring
-- the reporter is the only in-app reader). There's no maintainer UI for these — they're meant
-- to be triaged directly in the Supabase dashboard's Table Editor, the same way schema resets
-- and other admin tasks are already handled in this project.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  body text not null,
  page_url text default '',
  created_at timestamptz default now()
);

alter table public.bug_reports enable row level security;
drop policy if exists "Members can view their own bug reports" on public.bug_reports;
create policy "Members can view their own bug reports" on public.bug_reports for select using (auth.uid() = user_id);
drop policy if exists "Members can submit bug reports" on public.bug_reports;
create policy "Members can submit bug reports" on public.bug_reports for insert with check (auth.uid() = user_id);
