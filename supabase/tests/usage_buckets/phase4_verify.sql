-- Phase 4 verification — READ-ONLY. Run AFTER phase4_migrate.sql. One result set; every row should
-- read ok = true. Row 12 proves idempotency with a second invocation in DRY-RUN mode (it cannot write):
-- the wallet must be reported as already_migrated and nothing as would_migrate.
with cfg as materialized (
  select set_config('request.jwt.claim.role', 'service_role', true) as role
),
holder as (select '446eeaeb-585d-4f9a-a1dc-baa95ce54326'::uuid as id),
w as (select u.* from public.user_usage_credits u, holder where u.user_id = holder.id),
b as (select ub.* from public.usage_buckets ub where ub.purchase_ref = 'legacy:user_usage_credits:446eeaeb-585d-4f9a-a1dc-baa95ce54326'),
second as materialized (select public.migrate_legacy_usage_credits(true) as result from cfg),
second_rows as (select x from second, jsonb_array_elements(second.result -> 'wallets') x),
summary as (select public.pawos_usage_summary((select id from holder)) as s),
c as (
  select 1 as n, 'exactly one legacy wallet migrated (the holder)' as check_name,
         (select count(*) from public.user_usage_credits where migrated_at is not null) = 1
         and (select migrated_at is not null from w) as ok,
         (select count(*)::text from public.user_usage_credits where migrated_at is not null) || ' migrated' as detail
  union all
  select 2, 'exactly one bucket with key legacy:user_usage_credits:446eeaeb-…',
         (select count(*) from b) = 1 and (select count(*) from public.usage_buckets where purchase_ref like 'legacy:%') = 1,
         (select count(*)::text from b)
  union all
  select 3, 'bucket: $10 customer value, 1,000 PC, $7 private allowance, never expires, unspent',
         (select customer_value_cents = 1000 and customer_pc = 1000 and private_allowance_micro_usd = 7000000
                 and expires_at is null and source_type = 'purchased_credits' and product_key = 'credits' and status = 'active'
                 and consumed_micro_usd = 0 and reserved_micro_usd = 0 and user_id = (select id from holder) from b),
         (select customer_value_cents || ' cents / ' || customer_pc || ' PC / ' || private_allowance_micro_usd || ' micro-USD private / expires '
                 || coalesce(expires_at::text, 'never') || ' / ' || status from b)
  union all
  select 4, 'old legacy balance no longer spendable (0) and no positive legacy balance remains',
         (select balance_usd = 0 from w) and (select count(*) from public.user_usage_credits where balance_usd > 0) = 0,
         (select balance_usd::text from w)
  union all
  select 5, 'migrated_at is populated', (select migrated_at is not null from w), (select migrated_at::text from w)
  union all
  select 6, 'migrated_bucket_id points to the new bucket', (select migrated_bucket_id from w) = (select id from b), (select migrated_bucket_id::text from w)
  union all
  select 7, 'legacy_balance_usd_at_migration = 10', (select legacy_balance_usd_at_migration = 10 from w), (select legacy_balance_usd_at_migration::text from w)
  union all
  select 8, 'exactly one migration audit row, matching the bucket',
         (select count(*) from public.legacy_usage_credit_migrations) = 1
         and exists (select 1 from public.legacy_usage_credit_migrations m where m.user_id = (select id from holder) and m.bucket_id = (select id from b)
                       and m.legacy_balance_usd = 10 and m.customer_value_cents = 1000 and m.private_allowance_micro_usd = 7000000),
         (select count(*)::text from public.legacy_usage_credit_migrations)
  union all
  select 9, 'no duplicate: the only bucket in the system is this one',
         (select count(*) from public.usage_buckets) = 1, (select count(*)::text from public.usage_buckets) || ' buckets'
  union all
  select 10, 'only the holder''s legacy row was changed (no other wallet marked or changed)',
         (select count(*) from public.user_usage_credits where (migrated_at is not null or legacy_balance_usd_at_migration is not null) and user_id <> (select id from holder)) = 0,
         'compare phase2_snapshot.sql before/after for every other table'
  union all
  select 11, 'no reservations / events / discrepancies / revocations created',
         (select count(*) from public.usage_bucket_reservations) + (select count(*) from public.usage_bucket_events)
         + (select count(*) from public.usage_accounting_discrepancies) + (select count(*) from public.usage_bucket_revocations) = 0, null
  union all
  select 12, 'idempotent: a second invocation (dry run) reports already_migrated and nothing to migrate',
         (select count(*) from second_rows where x ->> 'action' = 'would_migrate') = 0
         and (select count(*) from second_rows where x ->> 'action' = 'already_migrated' and x ->> 'userId' = '446eeaeb-585d-4f9a-a1dc-baa95ce54326') = 1
         and (select count(*) from public.usage_buckets) = 1,
         (select result::text from second)
  union all
  select 13, 'customer view: Credits $10 / 1,000 PC remaining, with no private economics in the summary',
         (select (s -> 'buckets' -> 0 ->> 'amountPaidCents')::int = 1000 and (s -> 'buckets' -> 0 ->> 'pcRemaining')::int = 1000
                 and (s ->> 'creditsPcRemaining')::int = 1000 and lower(s::text) !~ 'micro|allowance|cost|price|token|model' from summary),
         (select (s -> 'buckets' -> 0 ->> 'label') || ' $' || ((s -> 'buckets' -> 0 ->> 'amountPaidCents')::int / 100) || ' / '
                 || (s -> 'buckets' -> 0 ->> 'pcRemaining') || ' PC remaining' from summary)
)
select n, check_name, ok, detail from c order by n;
