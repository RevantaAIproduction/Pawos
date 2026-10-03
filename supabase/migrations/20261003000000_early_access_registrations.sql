-- PawOS Early Access — pre-launch interest collected by the public form on
-- pawos-web (src/components/early-access/EarlyAccessSection.tsx). One row per
-- email address. A registration grants nothing: no account, no download, no
-- desktop access — it is a list of people to show real workflow
-- demonstrations to before the next release.
--
-- Deliberately separate from desktop_waitlist: that table is account-scoped
-- (user_id not null, one row per signed-in user), while this form is filled
-- in by anonymous visitors who have no PawOS account yet.

create table if not exists early_access_registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null,
  company text,
  github_profile text,
  selected_workflows text[] not null default '{}',
  custom_use_case text not null,
  source text not null default 'pawos-website-early-access',
  status text not null default 'registered',
  created_at timestamptz not null default now(),
  constraint early_access_registrations_has_workflow check (cardinality(selected_workflows) > 0)
);

-- Duplicate prevention. The API route lowercases the address before insert;
-- indexing lower(email) keeps the guarantee even for a row written by hand.
create unique index if not exists idx_early_access_registrations_email
  on early_access_registrations (lower(email));

create index if not exists idx_early_access_registrations_created
  on early_access_registrations (created_at desc);

-- RLS on with no policies: nothing is readable or writable with the anon or
-- an authenticated user's key. Every access goes through pawos-web's own API
-- routes using the service-role key, which bypasses RLS — POST
-- /api/early-access (validated insert) and GET /api/admin/early-access
-- (admin-only list).
alter table early_access_registrations enable row level security;
