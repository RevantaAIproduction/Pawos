-- Migration: 20261007030000_security_wallet_function_lockdown
--
-- SECURITY. Wallet functions from before payments were verified on the server are still callable by
-- every signed-in user — and by callers who are not signed in at all.
--
--   add_ticket_balance(organization, amount, reference)   adds $30–$20,000 of Ticket Balance to the
--                                                         caller's wallet, or to any organization's
--   add_task_credits(organization, credits, amount, ref)  adds task credits the same way
--   reserve_autonomous_task_pc(run, pc)                   moves any run owner's balance into reserve
--
-- None of them checks a payment or who is calling. 20260814000000 meant to close the first one with
-- "revoke execute ... from authenticated", but EXECUTE on a function is granted to PUBLIC by
-- default and every role inherits it, so that revoke removed nothing. (20260925090000 found and
-- fixed exactly this for the two *_service functions; these three were left.)
--
-- The apps do not call any of them: money reaches a wallet through add_ticket_balance_service /
-- add_usage_credits_service after pawos-web has verified the Razorpay payment, and reservations go
-- through reserve_autonomous_pc. So they are closed to clients outright: EXECUTE for the service
-- role only. Function bodies are not changed and nothing is dropped.
--
-- Data: none changed. Wallets credited through these functions in the past are NOT touched —
-- supabase/audits/20261007_organization_tier_audit.sql (query 7) lists top-ups with no Razorpay
-- payment behind them for review.
--
-- Run AFTER 20261007020000_security_function_hardening.sql.

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end;
$$;
