-- Migration: 20261007040000_security_usage_cannot_decrease
--
-- SECURITY (integrity). Recorded usage could be lowered by the people it is recorded against.
--
--   record_enterprise_api_usage(organization, cost)       adds `cost` to organizations.api_usage_usd
--   increment_organization_usage(organization, cap, n)    adds `n` to organization_usage_counters.used_amount
--
-- Both check that the caller is a member and both check the upper limit, but neither checks the
-- sign of what it is given. A member calling either with a negative number subtracts usage — back to
-- zero, month after month — so the organization's API budget and capability limits never bite.
--
-- Fixed where the numbers live rather than in the two function bodies (their definitions differ
-- between environments, and any other function that touches these columns is covered too):
-- for every request made with a signed-in user's token — directly or through a SECURITY DEFINER
-- function — recorded usage can only stay the same or go up.
--
--   organizations.api_usage_usd              may not be lowered or set to NULL
--   organization_usage_counters.used_amount  may not be lowered, set to NULL, or start below zero
--
-- A negative amount, a NULL amount and a non-numeric result are all refused by this one rule; a
-- positive amount works exactly as before; zero changes nothing and is accepted.
-- Not restricted: the service role and the database owner (a monthly reset job, support corrections
-- in the SQL editor). The new period's counter row still starts at 0 as it always has.
--
-- This does not make usage trustworthy — it is still the app that reports it, and an app that
-- reports nothing records nothing. That is the metering redesign, and is not attempted here.
--
-- Data: none changed.
--
-- Run AFTER 20261007030000_security_wallet_function_lockdown.sql.

create or replace function public.pawos_guard_usage_never_decreases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
  v_old numeric;
begin
  -- Requests made as a signed-in (or anonymous) API user, including inside SECURITY DEFINER functions.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  v_new := (to_jsonb(new) ->> tg_argv[0])::numeric;
  if v_new is null then
    raise exception 'Usage must be a number.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if v_new < 0 then
      raise exception 'Usage cannot start below zero.' using errcode = '22023';
    end if;
    return new;
  end if;

  v_old := coalesce((to_jsonb(old) ->> tg_argv[0])::numeric, 0);
  if v_new < v_old then
    raise exception 'Recorded usage cannot be reduced.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.pawos_guard_usage_never_decreases() from public, anon, authenticated;

-- organizations.api_usage_usd (Enterprise API budget). The column is created by a later-dated
-- migration than organizations itself and is absent in some environments: guard it where it exists.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'api_usage_usd') then
    drop trigger if exists trg_guard_organization_api_usage on public.organizations;
    create trigger trg_guard_organization_api_usage
      before update of api_usage_usd on public.organizations
      for each row execute function public.pawos_guard_usage_never_decreases('api_usage_usd');
  else
    raise notice 'organizations.api_usage_usd does not exist here; nothing to guard.';
  end if;
end;
$$;

-- organization_usage_counters.used_amount (per-capability monthly counters).
do $$
begin
  if to_regclass('public.organization_usage_counters') is not null then
    drop trigger if exists trg_guard_organization_usage_counter on public.organization_usage_counters;
    create trigger trg_guard_organization_usage_counter
      before insert or update of used_amount on public.organization_usage_counters
      for each row execute function public.pawos_guard_usage_never_decreases('used_amount');
  else
    raise notice 'organization_usage_counters does not exist here; nothing to guard.';
  end if;
end;
$$;
