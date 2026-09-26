-- Zelle and Apple Cash details for paying people back on a trip. Neither service has a link
-- that fills in a payment the way Venmo's does, so the app shows these for copying (Zelle)
-- or to open a Messages thread (Apple Cash). They're an email or a phone number, so unlike
-- the Venmo username on profiles they live in their own table and are visible only to
-- people you're on a trip with (going, waitlisted or its creator), not the whole crew.
create table if not exists public.payment_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  zelle text not null default '',
  apple_cash_phone text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.shares_trip_with(viewer uuid, owner uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select viewer = owner or exists (
    select 1 from public.trips t
    where (t.created_by = viewer or exists (select 1 from public.trip_attendees a where a.trip_id = t.id and a.user_id = viewer))
      and (t.created_by = owner or exists (select 1 from public.trip_attendees b where b.trip_id = t.id and b.user_id = owner))
  );
$$;

alter table public.payment_contacts enable row level security;
drop policy if exists "People on a trip with you can see how to pay you" on public.payment_contacts;
create policy "People on a trip with you can see how to pay you" on public.payment_contacts for select
  using (public.shares_trip_with(auth.uid(), user_id));
drop policy if exists "Anglers add their own payment details" on public.payment_contacts;
create policy "Anglers add their own payment details" on public.payment_contacts for insert
  with check (auth.uid() = user_id);
drop policy if exists "Anglers update their own payment details" on public.payment_contacts;
create policy "Anglers update their own payment details" on public.payment_contacts for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Anglers remove their own payment details" on public.payment_contacts;
create policy "Anglers remove their own payment details" on public.payment_contacts for delete
  using (auth.uid() = user_id);
