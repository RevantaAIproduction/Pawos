-- LOCAL SCRATCH DATABASE ONLY (see run.mjs). Additions to ../web_tier/local_stub.sql that the
-- organization / platform-admin migrations need. Never apply to a Supabase project.

-- Supabase builds auth.jwt() from the request's token; the tests set the claims directly.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'role', nullif(current_setting('request.jwt.claim.role', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), '')
  ));
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Supabase grants its API roles EXECUTE on public functions and USAGE on sequences by default.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;

-- Columns of Supabase's auth.users that the migrations under test read.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;
alter table auth.users add column if not exists created_at timestamptz not null default now();
alter table auth.users add column if not exists last_sign_in_at timestamptz;
