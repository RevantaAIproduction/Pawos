-- LOCAL SCRATCH DATABASE ONLY. Minimal stand-ins for what a Supabase project provides, so the Web
-- chat migrations can be applied to a throwaway plain PostgreSQL and exercised by run_local.sh.
-- Never apply this file to a Supabase project: it would replace auth.role()/auth.uid().

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth')
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'jwt') then
    raise exception 'refusing: this looks like a real Supabase database';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

create schema if not exists auth;
create schema if not exists storage;
create extension if not exists pgcrypto;

create table if not exists auth.users (id uuid primary key, email text);

-- Supabase derives these from the request's JWT; the tests set the claims directly.
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on storage.buckets to service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
