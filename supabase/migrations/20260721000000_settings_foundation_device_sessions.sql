-- PawOS Settings Foundation Phase 1 — Device Sessions
-- Apply via the Supabase dashboard SQL editor or `supabase db push`.
-- Uses gen_random_uuid() (pgcrypto), enabled by default on Supabase projects.

-- =========================================================================
-- Device Sessions — every device ever signed into this account, so the
-- Devices settings tab can show "This Device" + "Active Sessions" and
-- support "sign out of other devices". Lives in Supabase (not local JSON)
-- for the same reason Organizations does: a device signed in elsewhere must
-- be visible from this device. Simpler RLS than Organizations — a user only
-- ever sees their own rows, never another user's, so no security-definer
-- RPC is needed here.
--
-- Actually revoking a remote session's auth token is handled by Supabase
-- Auth itself (supabase.auth.signOut({ scope: 'others' })) — this table is
-- purely the display/metadata layer the client SDK doesn't otherwise expose.
-- =========================================================================
create table if not exists device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text not null,
  platform text not null,
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists idx_device_sessions_user_device
  on device_sessions(user_id, device_id);

alter table device_sessions enable row level security;

create policy device_sessions_own_select on device_sessions
  for select using (user_id = auth.uid());

create policy device_sessions_own_upsert on device_sessions
  for insert with check (user_id = auth.uid());

create policy device_sessions_own_update on device_sessions
  for update using (user_id = auth.uid());
