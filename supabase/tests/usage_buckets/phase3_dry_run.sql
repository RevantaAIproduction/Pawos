-- Phase 3: legacy wallet migration DRY RUN — changes nothing. One statement, so the Supabase SQL
-- editor shows its full result. The service-role claim is transaction-local (is_local = true), so it
-- lasts for this single statement only. migrate_legacy_usage_credits(true) never writes; the columns
-- after the dry-run result re-read the live tables to prove it.
--
-- Expected: wallets_reported = 1, would_migrate = 1, customer_value_cents = 1000, customer_pc = 1000,
-- private_allowance_micro_usd = 7000000 (private backend accounting — not customer value),
-- bucket_key = legacy:user_usage_credits:446eeaeb-585d-4f9a-a1dc-baa95ce54326, and every
-- "after" column unchanged: 0 buckets, balance 10.000000, migrated_at / migrated_bucket_id null.
with cfg as materialized (
  select set_config('request.jwt.claim.role', 'service_role', true) as role
),
dry as materialized (
  select public.migrate_legacy_usage_credits(true) as result from cfg
),
w as (
  select x from dry, jsonb_array_elements(dry.result -> 'wallets') x
)
select
  (select result ->> 'dryRun' from dry)                                                     as dry_run,
  (select count(*) from w)                                                                  as wallets_reported,
  (select count(*) from w where x ->> 'action' = 'would_migrate')                          as would_migrate,
  (select x ->> 'userId' from w where x ->> 'action' = 'would_migrate')                    as user_id,
  (select x ->> 'legacyBalanceUsd' from w where x ->> 'action' = 'would_migrate')          as legacy_balance_usd,
  (select (x ->> 'customerValueCents')::int from w where x ->> 'action' = 'would_migrate') as customer_value_cents,
  (select (x ->> 'customerPc')::int from w where x ->> 'action' = 'would_migrate')         as customer_pc,
  (select (x ->> 'privateAllowanceMicroUsd')::bigint from w where x ->> 'action' = 'would_migrate') as private_allowance_micro_usd,
  'never'                                                                                   as expiry,
  (select x ->> 'purchaseRef' from w where x ->> 'action' = 'would_migrate')               as bucket_key,
  -- after the dry run: nothing changed
  (select count(*) from public.usage_buckets)                                               as after_buckets,
  (select count(*) from public.usage_buckets where purchase_ref like 'legacy:%')            as after_legacy_buckets,
  (select balance_usd from public.user_usage_credits where user_id = '446eeaeb-585d-4f9a-a1dc-baa95ce54326') as after_legacy_balance,
  (select migrated_at is null and migrated_bucket_id is null and legacy_balance_usd_at_migration is null
     from public.user_usage_credits where user_id = '446eeaeb-585d-4f9a-a1dc-baa95ce54326')                as after_not_migrated,
  (select count(*) from public.legacy_usage_credit_migrations)                              as after_migration_audit_rows,
  (select count(*) from public.usage_bucket_reservations) + (select count(*) from public.usage_bucket_events)
    + (select count(*) from public.usage_accounting_discrepancies) + (select count(*) from public.usage_bucket_revocations) as after_usage_rows,
  (select result::text from dry)                                                            as raw_dry_run_result;
