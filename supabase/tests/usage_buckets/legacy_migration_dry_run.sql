-- Legacy usage-credit wallet → purchased_credits bucket: PRODUCTION DRY RUN (changes nothing).
-- Run in the Supabase SQL editor only after 20261001000000_usage_buckets.sql has been applied.
--
-- Rule (approved 2026-10-01): keep the customer's full value — $X → X × 100 PC, no expiry — with a
-- private provider-cost allowance of X × 0.70. Idempotent: one bucket per wallet
-- ('legacy:user_usage_credits:<user>'); a migrated wallet is zeroed, marked, and kept for audit.

-- 1. Read-only preview straight from the legacy table (works before or after the migration file).
select
  user_id,
  balance_usd                                   as legacy_balance_usd,
  floor(balance_usd * 100)::int                 as customer_value_cents,
  floor(balance_usd * 100)::int                 as customer_pc,
  floor(balance_usd * 1000000 * 0.70)::bigint   as private_allowance_micro_usd
from public.user_usage_credits
where balance_usd > 0;

-- 2. The migration function itself in dry-run mode, inside a transaction that is rolled back.
--    (It is service-role only; the SQL editor session claims that role for this transaction.)
begin;
select set_config('request.jwt.claim.role', 'service_role', true);
select public.migrate_legacy_usage_credits(true) as dry_run;
rollback;

-- 3. NOT PART OF THE DRY RUN — the real migration, only after explicit approval:
--    begin;
--    select set_config('request.jwt.claim.role', 'service_role', true);
--    select public.migrate_legacy_usage_credits(false);
--    commit;
