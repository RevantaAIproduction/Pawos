-- P0-2 security fix: closes the "client can credit itself without a genuine captured payment"
-- vulnerability found in the production readiness audit. The previous add_ticket_balance() RPC was
-- grantable to `authenticated` and trusted its p_amount_usd argument completely -- any signed-in
-- user (or a script in the Electron renderer's devtools) could call it directly with an arbitrary
-- amount and no proof any Razorpay payment ever happened. This migration:
--   1. Adds a payment-id column + idempotency guard so the same real payment can never be applied
--      twice, no matter which path applies it.
--   2. Adds a NEW function, add_ticket_balance_service(), that takes an explicit p_user_id (since a
--      service-role caller has no auth.uid()) and is grantable ONLY to service_role -- never to
--      authenticated. This is the only function pawos-web's new, Razorpay-signature-verifying API
--      routes are allowed to call.
--   3. REVOKES execute on the old add_ticket_balance() from `authenticated` -- this is the actual
--      close of the hole. The function body is left in place (not dropped) so nothing that
--      references it at the SQL level breaks; it simply becomes unreachable by any client that
--      isn't holding the service-role key, which never leaves pawos-web's own server.
--   4. Adds the missing $20,000 maximum top-up enforcement at this layer (not just in the UI) to
--      both the old and new functions.

alter table ticket_balance_topups add column if not exists razorpay_payment_id text;

-- Idempotency: the same real Razorpay payment can only ever be recorded once, regardless of how
-- many times a client (or a retried webhook delivery) tries to apply it.
create unique index if not exists idx_ticket_balance_topups_payment_id
  on ticket_balance_topups (razorpay_payment_id)
  where razorpay_payment_id is not null;

create or replace function add_ticket_balance_service(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount_usd numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_existing_id uuid;
  v_topup_id uuid;
begin
  if p_razorpay_payment_id is null or length(trim(p_razorpay_payment_id)) = 0 then
    raise exception 'add_ticket_balance_service requires a real razorpay_payment_id -- this function must never be called for an unverified credit.';
  end if;
  if (p_user_id is null) = (p_organization_id is null) then
    raise exception 'Exactly one of p_user_id / p_organization_id must be set.';
  end if;
  if p_amount_usd < 30 then
    raise exception 'Minimum top-up is $30';
  end if;
  if p_amount_usd > 20000 then
    raise exception 'Maximum top-up is $20,000';
  end if;

  -- Idempotent: if this exact Razorpay payment was already applied (by the synchronous
  -- Electron-triggered path, a retried webhook delivery, or both racing each other), return the
  -- existing topup id and credit nothing a second time.
  select id into v_existing_id from ticket_balance_topups where razorpay_payment_id = p_razorpay_payment_id;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into ticket_balance_topups (user_id, organization_id, amount_usd, payment_reference, razorpay_payment_id)
  values (p_user_id, p_organization_id, p_amount_usd, p_razorpay_payment_id, p_razorpay_payment_id)
  returning id into v_topup_id;

  if p_organization_id is null then
    insert into user_task_credits (user_id, balance_usd) values (p_user_id, p_amount_usd)
    on conflict (user_id) do update set balance_usd = user_task_credits.balance_usd + p_amount_usd, updated_at = now();
  else
    insert into organization_task_credits (organization_id, balance_usd) values (p_organization_id, p_amount_usd)
    on conflict (organization_id) do update set balance_usd = organization_task_credits.balance_usd + p_amount_usd, updated_at = now();
  end if;

  return v_topup_id;
end;
$$;

-- SECURITY: service_role only. This function trusts p_amount_usd and p_user_id completely with no
-- further checks of its own -- it must only ever be called by server-side code that has ALREADY
-- independently verified a real, captured Razorpay payment (see pawos-web's
-- /api/billing/credit-ticket-balance route and the payment.captured webhook handler). Never grant
-- this to `authenticated` or `anon`.
revoke all on function add_ticket_balance_service(uuid, uuid, numeric, text) from public, authenticated, anon;
grant execute on function add_ticket_balance_service(uuid, uuid, numeric, text) to service_role;

-- Close the actual hole: a signed-in user (or anything running in that user's browser/renderer
-- session, including devtools) can no longer call the old, self-reported-amount RPC directly.
revoke execute on function add_ticket_balance(uuid, numeric, text) from authenticated;

-- Defense in depth: even if this function is ever re-granted by a future change, it can no longer
-- accept an unbounded amount.
create or replace function add_ticket_balance(
  p_organization_id uuid,
  p_amount_usd numeric,
  p_payment_reference text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_topup_id uuid;
begin
  if p_amount_usd < 30 then
    raise exception 'Minimum top-up is $30';
  end if;
  if p_amount_usd > 20000 then
    raise exception 'Maximum top-up is $20,000';
  end if;

  insert into ticket_balance_topups (user_id, organization_id, amount_usd, payment_reference)
  values (case when p_organization_id is null then auth.uid() else null end, p_organization_id, p_amount_usd, p_payment_reference)
  returning id into v_topup_id;

  if p_organization_id is null then
    insert into user_task_credits (user_id, balance_usd) values (auth.uid(), p_amount_usd)
    on conflict (user_id) do update set balance_usd = user_task_credits.balance_usd + p_amount_usd, updated_at = now();
  else
    insert into organization_task_credits (organization_id, balance_usd) values (p_organization_id, p_amount_usd)
    on conflict (organization_id) do update set balance_usd = organization_task_credits.balance_usd + p_amount_usd, updated_at = now();
  end if;

  return v_topup_id;
end;
$$;
