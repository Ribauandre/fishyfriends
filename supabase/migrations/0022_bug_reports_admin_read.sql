-- 0014 scoped bug_reports reads to "reporter sees only their own row" and left triage to the
-- Supabase dashboard's Table Editor. This adds a second, permissive select policy so the app
-- owner can review every submitted report from an in-app admin page instead — gated on the
-- owner's account email via the JWT claim, so it never widens what any other member can see.
drop policy if exists "Admin can view all bug reports" on public.bug_reports;
create policy "Admin can view all bug reports" on public.bug_reports for select
  using ((auth.jwt() ->> 'email') = 'ribauandre@yahoo.com');
