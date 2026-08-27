-- Internal Admin/Test Tier Override table
-- Persists test tier overrides across app restarts
-- Server-side authorization enforced via RLS

create table if not exists admin_test_tier_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  real_tier text not null,
  override_tier text not null,
  applied_by text not null, -- email of admin who applied
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, organization_id) -- one override per user per org (or NULL org)
);

-- Audit logging table for test tier changes
create table if not exists admin_test_tier_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  administrator_id uuid references auth.users(id) on delete set null,
  administrator_email text not null,
  action text not null, -- 'apply' | 'clear'
  previous_tier text,
  new_tier text,
  created_at timestamp with time zone default now()
);

-- Row-level security: only internal admins can access
alter table admin_test_tier_overrides enable row level security;
alter table admin_test_tier_audit enable row level security;

-- Allow admins to read/write overrides
create policy "admin_test_tier_override_access" on admin_test_tier_overrides
  for all
  using (
    (select email from auth.users where id = auth.uid()) in (
      'tharun@revantaai.com',
      'founder@revantaai.com',
      'pawos@revantaai.com'
    )
  );

-- Allow admins to read audit log
create policy "admin_test_tier_audit_read" on admin_test_tier_audit
  for select
  using (
    (select email from auth.users where id = auth.uid()) in (
      'tharun@revantaai.com',
      'founder@revantaai.com',
      'pawos@revantaai.com'
    )
  );

-- Allow admins to insert audit log
create policy "admin_test_tier_audit_insert" on admin_test_tier_audit
  for insert
  with check (
    (select email from auth.users where id = auth.uid()) in (
      'tharun@revantaai.com',
      'founder@revantaai.com',
      'pawos@revantaai.com'
    )
  );

-- Indexes for performance
create index idx_admin_test_tier_overrides_user_id on admin_test_tier_overrides(user_id);
create index idx_admin_test_tier_overrides_organization_id on admin_test_tier_overrides(organization_id);
create index idx_admin_test_tier_audit_user_id on admin_test_tier_audit(user_id);
create index idx_admin_test_tier_audit_created_at on admin_test_tier_audit(created_at);
