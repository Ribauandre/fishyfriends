-- 0014 scoped bug_reports reads to "reporter sees only their own row" and left triage to the
-- Supabase dashboard's Table Editor. This added a second, permissive select policy so the app
-- owner could review every submitted report from an in-app admin page.
--
-- It used to gate on the owner's sign-in email, written out here and in the client bundle,
-- which published that address to every visitor. The address has been taken out of this file
-- (already applied everywhere it matters, so editing it changes nothing live); 0042 replaced
-- the policy with one that asks public.is_admin(). On a replay from scratch this now makes a
-- policy that matches nobody, which 0042 then drops.
drop policy if exists "Admin can view all bug reports" on public.bug_reports;
create policy "Admin can view all bug reports" on public.bug_reports for select
  using (false);
