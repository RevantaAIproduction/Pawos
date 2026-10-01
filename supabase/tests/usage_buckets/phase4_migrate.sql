-- Phase 4: EXECUTE the legacy wallet migration — run ONCE, in the Supabase SQL editor.
-- One statement (one transaction): the service-role claim is transaction-local and lasts for this
-- statement only. migrate_legacy_usage_credits(false) converts each unmigrated positive legacy wallet
-- into one purchased_credits bucket (customer value kept in full; private allowance = 70%), zeroes and
-- marks the legacy row, and writes one audit row. Idempotent: a wallet already migrated is skipped.
--
-- Expected result: {"dryRun": false, "wallets": [{"action": "migrated", "userId": "446eeaeb-…",
--   "legacyBalanceUsd": 10.000000, "customerValueCents": 1000, "customerPc": 1000,
--   "privateAllowanceMicroUsd": 7000000, "bucketId": "<new bucket id>"}]}
with cfg as materialized (
  select set_config('request.jwt.claim.role', 'service_role', true) as role
)
select public.migrate_legacy_usage_credits(false) as migration_result from cfg;
