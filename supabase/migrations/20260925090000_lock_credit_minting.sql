-- Migration: 20260925090000_lock_credit_minting
--
-- SECURITY: add_usage_credits_service() mints purchased Paw Compute. Its only guard was
-- "auth.uid() is not null → refuse", but a NOT-signed-in caller has no uid, and EXECUTE was granted
-- to anon — so anyone holding the app's public (anon) key could credit any account (verified on the
-- live database: $10 → $510 in a rolled-back test). Only pawos-web's service-role key may mint.
--
-- Fix: EXECUTE for service_role only, and the function itself refuses any caller whose JWT role is
-- not service_role. Same hardening for add_ticket_balance_service().

revoke all on function public.add_usage_credits_service(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.add_usage_credits_service(uuid, uuid, numeric, text) to service_role;

create or replace function public.add_usage_credits_service(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount_usd numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Backend-only: pawos-web calls this with the service-role key after verifying a real Razorpay payment.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: add_usage_credits_service is a backend-only operation' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then
    raise exception 'invalid amount';
  end if;
  if coalesce(btrim(p_razorpay_payment_id), '') = '' then
    raise exception 'missing payment id';
  end if;

  insert into usage_credit_payments (payment_id, user_id, amount_usd)
  values (p_razorpay_payment_id, p_user_id, p_amount_usd)
  on conflict (payment_id) do nothing;

  if found then
    insert into user_usage_credits (user_id, balance_usd) values (p_user_id, p_amount_usd)
    on conflict (user_id) do update set balance_usd = user_usage_credits.balance_usd + p_amount_usd, updated_at = now();
  end if;

  return gen_random_uuid();
end;
$$;

revoke all on function public.add_usage_credits_service(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.add_usage_credits_service(uuid, uuid, numeric, text) to service_role;

revoke all on function public.add_ticket_balance_service(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.add_ticket_balance_service(uuid, uuid, numeric, text) to service_role;
