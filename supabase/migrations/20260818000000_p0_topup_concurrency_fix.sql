-- Phase 2 (Razorpay payment verification) concurrency fix.
--
-- add_ticket_balance_service() already has real idempotency for SEQUENTIAL duplicate calls (a
-- "select ... if found return existing id" check before the insert). But two truly CONCURRENT
-- calls for the SAME razorpay_payment_id (e.g. the browser callback and a retried webhook delivery
-- landing at the same instant) can both pass that select-check before either transaction commits —
-- money-safety already holds via the unique partial index on razorpay_payment_id (the DB itself
-- guarantees only one row can ever exist), but the LOSING concurrent caller currently gets a hard,
-- unhandled unique_violation error instead of a clean idempotent success. This migration adds
-- exception handling so a concurrent duplicate always resolves to the same, real topup id -- never
-- an error and never a double credit.

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

  -- Fast path: an already-committed duplicate (sequential replay, or this call losing a race that
  -- already resolved by the time we look).
  select id into v_existing_id from ticket_balance_topups where razorpay_payment_id = p_razorpay_payment_id;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  begin
    insert into ticket_balance_topups (user_id, organization_id, amount_usd, payment_reference, razorpay_payment_id)
    values (p_user_id, p_organization_id, p_amount_usd, p_razorpay_payment_id, p_razorpay_payment_id)
    returning id into v_topup_id;
  exception
    when unique_violation then
      -- Genuine race: another concurrent call for the SAME razorpay_payment_id committed its insert
      -- between our select above and this insert. The unique partial index already guarantees no
      -- double row exists -- re-select and return the real, already-credited id instead of raising.
      select id into v_topup_id from ticket_balance_topups where razorpay_payment_id = p_razorpay_payment_id;
      if v_topup_id is not null then
        return v_topup_id;
      end if;
      -- Should be unreachable (the unique_violation guarantees a row exists), but never swallow an
      -- unexplained failure silently.
      raise;
  end;

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

revoke all on function add_ticket_balance_service(uuid, uuid, numeric, text) from public, authenticated, anon;
grant execute on function add_ticket_balance_service(uuid, uuid, numeric, text) to service_role;
