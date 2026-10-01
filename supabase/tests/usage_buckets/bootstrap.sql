-- Minimal Supabase stand-ins for a throwaway local Postgres, so the real migrations can be applied
-- and tested without Docker or a hosted project. Never run against a real Supabase project.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

-- Supabase reads these from the request's JWT; tests set them with set_config().
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- 20260925090000_lock_credit_minting.sql revokes grants on this autonomous function; it only has
-- to exist here (autonomous billing is not part of these tests).
create or replace function public.add_ticket_balance_service(uuid, uuid, numeric, text)
returns uuid language sql as $$ select gen_random_uuid(); $$;
