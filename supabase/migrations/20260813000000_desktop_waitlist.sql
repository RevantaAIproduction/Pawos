-- Desktop launch waitlist — captures a signed-in user's interest in PawOS
-- Desktop (public installers not yet available) so they can be emailed once
-- when it launches, and again on future version updates. One row per
-- account (unique on user_id) — clicking "Notify me" again from another
-- platform page just updates platform/source, never creates a duplicate or
-- re-sends the confirmation email (that decision is made in the API route,
-- not here).
--
-- Deliberately account-scoped only (no anonymous/email-only capture) — the
-- reported bug this closes is specifically "an already-logged-in user gets
-- asked to log in again"; anonymous visitors keep going through /signup as
-- before, which is unaffected by this table.

create table if not exists desktop_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  platform text,
  source text,
  created_at timestamptz not null default now(),
  launch_notified_at timestamptz,
  last_update_notified_at timestamptz,
  last_update_version text
);

create index if not exists idx_desktop_waitlist_user on desktop_waitlist(user_id);

alter table desktop_waitlist enable row level security;

-- A user may read/insert/update only their own row. The broadcast job (see
-- the API route) uses the service-role key, which bypasses RLS entirely —
-- it never needs its own policy here.
create policy desktop_waitlist_select_own on desktop_waitlist
  for select using (auth.uid() = user_id);

create policy desktop_waitlist_insert_own on desktop_waitlist
  for insert with check (auth.uid() = user_id);

create policy desktop_waitlist_update_own on desktop_waitlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
