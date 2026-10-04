-- Account profile: the one canonical, account-level record for
--   (a) which Companion the account uses (shared by PawOS Web and PawOS Desktop), and
--   (b) the opt-in public profile (handle, on/off switch, the few fields the owner chose to show).
--
-- No profile table existed before this (accounts are auth.users rows plus per-feature tables), so
-- this adds exactly one. The public profile deliberately has no Companion column of its own: it
-- reads companion_id from the same row, so changing the Companion changes the public profile.
--
-- Every write goes through the security-definer functions below, which act only on auth.uid().
-- There are no insert/update/delete policies, and nothing here is readable by another account.
-- The only anonymous entry point is get_public_profile(handle), which returns a fixed whitelist of
-- fields and only while the owner has the profile switched on. It never returns the user id, the
-- email address, or anything from another table.

-- ── Companion catalog ────────────────────────────────────────────────────────────────────────
-- The ids an account may select. Display metadata (name, description, preview) lives in the apps
-- (pawos-web/src/lib/account/companionCatalog.ts); this table is what the backend enforces.
-- required_feature is a PawOS FeatureId: null means every tier may select the Companion.
create table if not exists companion_catalog (
  companion_id text primary key,
  required_feature text,
  created_at timestamptz not null default now()
);

alter table companion_catalog enable row level security;

drop policy if exists companion_catalog_read on companion_catalog;
create policy companion_catalog_read on companion_catalog
  for select to authenticated using (true);

-- 'paw-default' is the id PawOS Desktop already uses for the official Paw companion
-- (DEFAULT_PAW_ID in src/renderer/companion/manager/CompanionProfileTypes.ts).
insert into companion_catalog (companion_id, required_feature)
values ('paw-default', null)
on conflict (companion_id) do nothing;

-- ── Account profile ──────────────────────────────────────────────────────────────────────────
create table if not exists account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null,
  public_profile_enabled boolean not null default false,
  display_name text,
  bio text,
  public_links jsonb not null default '[]',
  -- Exactly one of these two is set. companion_id is a catalog Companion. custom_companion_name is
  -- set instead when the desktop app is using a Companion the user made locally (an uploaded
  -- model that exists only on that machine) — the account then records its name, nothing more.
  companion_id text references companion_catalog(companion_id),
  custom_companion_name text,
  companion_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_profiles_handle_format check (handle ~ '^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$'),
  constraint account_profiles_one_companion check ((companion_id is not null) <> (custom_companion_name is not null)),
  constraint account_profiles_bio_length check (bio is null or char_length(bio) <= 280),
  constraint account_profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 80),
  constraint account_profiles_custom_name_length check (custom_companion_name is null or char_length(custom_companion_name) between 1 and 80)
);

create unique index if not exists idx_account_profiles_handle on account_profiles (handle);

alter table account_profiles enable row level security;

drop policy if exists account_profiles_select_own on account_profiles;
create policy account_profiles_select_own on account_profiles
  for select using (user_id = auth.uid());

-- ── Internal helpers ─────────────────────────────────────────────────────────────────────────
-- Random, never derived from the email address or name, so an unconfigured handle reveals nothing.
create or replace function public.pawos_ensure_account_profile(p_user_id uuid)
returns public.account_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_profiles;
  v_handle text;
begin
  select * into v_row from public.account_profiles where user_id = p_user_id;
  if found then
    return v_row;
  end if;

  loop
    v_handle := 'paw-' || substr(md5(gen_random_uuid()::text), 1, 10);
    begin
      insert into public.account_profiles (user_id, handle, companion_id)
      values (p_user_id, v_handle, 'paw-default')
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      -- Either another request created this user's row first, or the handle collided.
      select * into v_row from public.account_profiles where user_id = p_user_id;
      if found then
        return v_row;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.pawos_ensure_account_profile(uuid) from public, anon, authenticated;

create or replace function public.pawos_account_profile_json(p public.account_profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'handle', p.handle,
    'publicProfileEnabled', p.public_profile_enabled,
    'displayName', p.display_name,
    'bio', p.bio,
    'links', p.public_links,
    'companionId', p.companion_id,
    'customCompanionName', p.custom_companion_name,
    'companionUpdatedAt', p.companion_updated_at
  );
$$;

revoke all on function public.pawos_account_profile_json(public.account_profiles) from public, anon, authenticated;

-- ── Owner RPCs (the signed-in account's own row only) ────────────────────────────────────────
create or replace function public.get_my_account_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return public.pawos_account_profile_json(public.pawos_ensure_account_profile(v_uid));
end;
$$;

revoke all on function public.get_my_account_profile() from public, anon;
grant execute on function public.get_my_account_profile() to authenticated;

-- Selects a catalog Companion (p_companion_id) or records a desktop-local one (p_custom_name).
-- A Companion with a required_feature cannot be selected here: this function cannot evaluate a
-- FeatureId, so a gated Companion is only ever set by set_user_companion_service() after the
-- backend has checked the account's entitlement. Today no Companion is gated.
create or replace function public.set_my_companion(p_companion_id text, p_custom_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_required text;
  v_custom text := nullif(btrim(coalesce(p_custom_name, '')), '');
  v_row public.account_profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if (p_companion_id is null) = (v_custom is null) then
    raise exception 'invalid_companion' using errcode = '22023';
  end if;
  if v_custom is not null and char_length(v_custom) > 80 then
    raise exception 'invalid_companion' using errcode = '22023';
  end if;

  if p_companion_id is not null then
    select required_feature into v_required from public.companion_catalog where companion_id = p_companion_id;
    if not found then
      raise exception 'unknown_companion' using errcode = '22023';
    end if;
    if v_required is not null then
      raise exception 'companion_not_available' using errcode = '42501';
    end if;
  end if;

  perform public.pawos_ensure_account_profile(v_uid);
  update public.account_profiles
  set companion_id = p_companion_id,
      custom_companion_name = v_custom,
      companion_updated_at = now(),
      updated_at = now()
  where user_id = v_uid
  returning * into v_row;
  return public.pawos_account_profile_json(v_row);
end;
$$;

revoke all on function public.set_my_companion(text, text) from public, anon;
grant execute on function public.set_my_companion(text, text) to authenticated;

-- Backend-only: sets any catalog Companion for a user, after pawos-web has verified the account
-- holds the Companion's required_feature. Rejects every caller except the service role.
create or replace function public.set_user_companion_service(p_user_id uuid, p_companion_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_profiles;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companion_catalog where companion_id = p_companion_id) then
    raise exception 'unknown_companion' using errcode = '22023';
  end if;
  perform public.pawos_ensure_account_profile(p_user_id);
  update public.account_profiles
  set companion_id = p_companion_id,
      custom_companion_name = null,
      companion_updated_at = now(),
      updated_at = now()
  where user_id = p_user_id
  returning * into v_row;
  return public.pawos_account_profile_json(v_row);
end;
$$;

revoke all on function public.set_user_companion_service(uuid, text) from public, anon, authenticated;
grant execute on function public.set_user_companion_service(uuid, text) to service_role;

-- Updates the public-profile settings. p_links is a JSON array of at most 5 { "label", "url" }
-- objects; only https:// links are accepted. Raises 'handle_taken' / 'invalid_handle' /
-- 'invalid_profile' so the caller can show a precise message.
create or replace function public.update_my_public_profile(
  p_enabled boolean,
  p_handle text,
  p_display_name text,
  p_bio text,
  p_links jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  v_display text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
  v_links jsonb := coalesce(p_links, '[]'::jsonb);
  v_link jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_row public.account_profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_handle !~ '^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$'
     or v_handle in ('admin', 'api', 'pawos', 'paw', 'support', 'help', 'settings', 'dashboard', 'login', 'signup', 'revanta', 'revantaai') then
    raise exception 'invalid_handle' using errcode = '22023';
  end if;
  if (v_display is not null and char_length(v_display) > 80)
     or (v_bio is not null and char_length(v_bio) > 280)
     or jsonb_typeof(v_links) <> 'array'
     or jsonb_array_length(v_links) > 5 then
    raise exception 'invalid_profile' using errcode = '22023';
  end if;

  for v_link in select * from jsonb_array_elements(v_links) loop
    if jsonb_typeof(v_link) <> 'object'
       or coalesce(char_length(btrim(v_link->>'label')), 0) not between 1 and 40
       or coalesce(v_link->>'url', '') !~ '^https://[^\s<>"'']{1,300}$' then
      raise exception 'invalid_profile' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('label', btrim(v_link->>'label'), 'url', v_link->>'url'));
  end loop;

  perform public.pawos_ensure_account_profile(v_uid);
  begin
    update public.account_profiles
    set public_profile_enabled = coalesce(p_enabled, false),
        handle = v_handle,
        display_name = v_display,
        bio = v_bio,
        public_links = v_clean,
        updated_at = now()
    where user_id = v_uid
    returning * into v_row;
  exception when unique_violation then
    raise exception 'handle_taken' using errcode = '23505';
  end;
  return public.pawos_account_profile_json(v_row);
end;
$$;

revoke all on function public.update_my_public_profile(boolean, text, text, text, jsonb) from public, anon;
grant execute on function public.update_my_public_profile(boolean, text, text, text, jsonb) to authenticated;

-- ── Public read ──────────────────────────────────────────────────────────────────────────────
-- The only anonymous entry point. Looks a profile up by its public handle (never a user id) and
-- returns null — indistinguishable from "no such handle" — unless the owner has switched the
-- public profile on. The returned object is a fixed whitelist: no user id, no email address.
-- The name and picture fall back to what the account's sign-in provider supplied.
create or replace function public.get_public_profile(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_row public.account_profiles;
  v_meta jsonb;
begin
  select * into v_row
  from public.account_profiles
  where handle = lower(btrim(coalesce(p_handle, '')))
    and public_profile_enabled;
  if not found then
    return null;
  end if;

  select u.raw_user_meta_data into v_meta from auth.users u where u.id = v_row.user_id;

  return jsonb_build_object(
    'handle', v_row.handle,
    'displayName', coalesce(
      v_row.display_name,
      nullif(v_meta->>'full_name', ''),
      nullif(v_meta->>'name', ''),
      v_row.handle
    ),
    'avatarUrl', coalesce(nullif(v_meta->>'avatar_url', ''), nullif(v_meta->>'picture', '')),
    'bio', v_row.bio,
    'links', v_row.public_links,
    'companionId', v_row.companion_id,
    'customCompanionName', v_row.custom_companion_name
  );
end;
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;
