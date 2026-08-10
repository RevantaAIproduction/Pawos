-- Mobile Presence — server-side feature-gating sweep (MOB-11 / user's MOB-10).
-- Extends 20260730000000_mobile_presence_phase1.sql and
-- 20260730020000_mobile_presence_pairing_enforcement.sql.
--
-- Audit finding this closes: pairing itself (begin_pairing_session) already
-- re-checks user_entitlements server-side, but every other Mobile Presence
-- surface — publish_cross_device_event() (used by Cross Device Runtime,
-- Notification Runtime, Conversation Sync, and the Approval Center) and the
-- device_push_subscriptions insert policy — only checked caller identity,
-- never tier. A Go-tier account with a scripted client (no Electron app, no
-- patched binary needed — just a valid Supabase session) could call
-- publish_cross_device_event() or insert a push subscription directly and
-- get the full personal Mobile Presence experience for free, since the
-- Electron client's ipc.entitlementIsFeatureAvailable() check is local to
-- the user's own binary and was never re-verified server-side. This mirrors
-- begin_pairing_session()'s existing pattern exactly: fail closed to 'go'
-- for anyone who has never synced an entitlement.
--
-- Scope: only the PERSONAL (organization_id is null) path is gated here.
-- Org-scoped publishes keep their existing is_org_member() check untouched
-- — org seat/tier enforcement is a separate, already-built system (see
-- BILL-T3/BILL-T4) this migration does not attempt to re-derive.

-- =========================================================================
-- publish_cross_device_event() — re-defined to require the same Pro+
-- entitlement as pairing for any personal (non-organization) publish.
-- =========================================================================
create or replace function publish_cross_device_event(
  p_event_type text,
  p_source_runtime text,
  p_payload jsonb default '{}'::jsonb,
  p_user_id uuid default null,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_event_id uuid;
  v_tier text;
begin
  if v_caller is null then
    raise exception 'not authorized';
  end if;

  if p_user_id is not null and p_user_id != v_caller then
    raise exception 'not authorized: cannot publish an event into another user''s personal feed';
  end if;

  if p_organization_id is not null and not is_org_member(p_organization_id, v_caller) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  if p_organization_id is null then
    select tier into v_tier from user_entitlements where user_id = v_caller;
    if coalesce(v_tier, 'go') = 'go' then
      raise exception 'Cross Device Runtime requires Paw Pro or higher.';
    end if;
  end if;

  if p_user_id is null and p_organization_id is null then
    p_user_id := v_caller;
  end if;

  insert into cross_device_events (user_id, organization_id, event_type, source_runtime, payload)
  values (p_user_id, p_organization_id, p_event_type, p_source_runtime, p_payload)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- =========================================================================
-- device_push_subscriptions_own_insert — re-defined to also require real
-- ownership of an active trusted_devices row (previously only checked
-- user_id = auth.uid(), so a caller could attach a push endpoint to any
-- device_id that merely satisfied the foreign key) and the same Pro+
-- entitlement as every other Mobile Presence surface.
-- =========================================================================
drop policy if exists device_push_subscriptions_own_insert on device_push_subscriptions;

create policy device_push_subscriptions_own_insert on device_push_subscriptions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from trusted_devices td
      where td.id = device_id and td.user_id = auth.uid() and td.status = 'active'
    )
    and coalesce((select tier from user_entitlements where user_id = auth.uid()), 'go') != 'go'
  );
