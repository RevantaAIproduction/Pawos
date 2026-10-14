-- Migration: 20261014000000_org_members_provisioned_by_pawos
--
-- Members of a Team or Enterprise organization are added by PawOS, not by the customer.
--
-- Until now an organization's owner or manager could invite teammates themselves: the app inserted
-- an 'invited' row into organization_members directly, and row level security allowed it. Team and
-- Enterprise organizations are now onboarded through PawOS sales — PawOS reviews the request and
-- provisions the members, seats and plan. The app no longer offers the invite form for those plans;
-- this trigger is what makes that true for a direct API call as well.
--
-- For an organization whose tier is 'team' or 'enterprise', a request made as a signed-in (or
-- anonymous) API user can no longer:
--   - insert a membership row (invite or add a member);
--   - change a row's email (re-point a pending seat at somebody else);
--   - change a row's seat rate (Standard / Premium);
--   - bring back a removed membership, or put a membership back to 'invited';
--   - move a membership into or out of such an organization;
--   - attach an account to a membership, or make one active, on that account's behalf. A membership
--     becomes active only when the invited account accepts it itself.
--
-- These rules stand on their own: they do not depend on the seat and owner rules of
-- 20261007010000_security_seats_and_admin_identity.sql being installed, and do not replace them.
--
-- Unchanged, deliberately:
--   - Accepting an invitation. accept_organization_invite() links the signed-in account to the row
--     addressed to its own email and makes it active; it changes none of the columns above.
--   - Removing a member and changing a role, for whoever could before (row level security and the
--     existing owner-protection triggers still decide that).
--   - Organizations on any other tier (a free organization still invites its own teammates).
--   - PawOS's own provisioning with the service role. Every other rule still applies to it: the
--     organization's email domain (20260721000100) and the paid-seat limits (20261007010000) are
--     separate triggers and are not relaxed here.
--
-- One rule applies to everyone, service role included, for these organizations: a membership's email
-- must be one well-formed address. The domain rule compares only the text after the first "@", so
-- without this "a@customer.com@elsewhere.io" would count as being on customer.com.
--
-- No table, column, policy or existing row is changed. Safe to run more than once.

create or replace function public.pawos_guard_managed_org_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_old_tier text;
  v_caller uuid := auth.uid();
begin
  select o.tier into v_tier from public.organizations o where o.id = new.organization_id;
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    select o.tier into v_old_tier from public.organizations o where o.id = old.organization_id;
  end if;
  if coalesce(v_tier, '') not in ('team', 'enterprise') and coalesce(v_old_tier, '') not in ('team', 'enterprise') then
    return new; -- other tiers are not provisioned by PawOS
  end if;

  -- For everyone: a new or changed email is one well-formed address.
  if (tg_op = 'INSERT' or new.email is distinct from old.email)
     and coalesce(new.email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A member''s email must be one valid email address.' using errcode = '22023';
  end if;

  -- PawOS's own provisioning (the service role, or the database owner) is not restricted further.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Members of a Team or Enterprise organization are added by PawOS. Contact PawOS sales to add members.' using errcode = '42501';
  end if;

  -- A membership stays in its organization: it cannot be created elsewhere and moved in, or moved out.
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Members of a Team or Enterprise organization are added by PawOS. Contact PawOS sales to add members.' using errcode = '42501';
  end if;
  -- The account on a membership is set once, by that account, when it accepts its own invitation.
  if new.user_id is distinct from old.user_id and (old.user_id is not null or new.user_id is null or new.user_id is distinct from v_caller) then
    raise exception 'A member joins a Team or Enterprise organization by accepting their own invitation.' using errcode = '42501';
  end if;
  if new.status = 'active' and old.status is distinct from 'active' and (new.user_id is null or new.user_id is distinct from v_caller) then
    raise exception 'A member joins a Team or Enterprise organization by accepting their own invitation.' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(new.email, ''))) is distinct from lower(btrim(coalesce(old.email, ''))) then
    raise exception 'A seat in a Team or Enterprise organization is reassigned by PawOS. Contact PawOS sales.' using errcode = '42501';
  end if;
  if new.seat_tier is distinct from old.seat_tier then
    raise exception 'Seats in a Team or Enterprise organization are allocated by PawOS. Contact PawOS sales.' using errcode = '42501';
  end if;
  if (old.status = 'removed' and new.status is distinct from 'removed')
     or (old.status is distinct from 'invited' and new.status = 'invited') then
    raise exception 'Members of a Team or Enterprise organization are added by PawOS. Contact PawOS sales to add members.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.pawos_guard_managed_org_membership() from public, anon, authenticated;

drop trigger if exists trg_guard_managed_org_membership on public.organization_members;
create trigger trg_guard_managed_org_membership
  before insert or update on public.organization_members
  for each row execute function public.pawos_guard_managed_org_membership();
