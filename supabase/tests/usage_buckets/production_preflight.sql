-- PRODUCTION PRE-FLIGHT for 20261001000000_usage_buckets.sql — READ-ONLY.
-- Run in the Supabase SQL editor BEFORE applying the migration. It only SELECTs; nothing changes.
-- Every row should read ok = true (except the informational rows marked "info").

with checks as (
  -- 1. Objects the migration builds on must exist with the expected shape.
  select 'pawos_subscriptions has the columns the migration reads' as check_name,
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pawos_subscriptions'
            and column_name in ('id', 'user_id', 'tier', 'pro_max_variant', 'status', 'current_period_end', 'billing_frequency')) = 7 as ok,
         null::text as detail
  union all
  select 'user_usage_credits.balance_usd is numeric(14,6)',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_usage_credits'
                   and column_name = 'balance_usd' and numeric_precision = 14 and numeric_scale = 6), null
  union all
  select 'usage_credit_payments and usage_credit_deductions exist',
         (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('usage_credit_payments', 'usage_credit_deductions')) = 2, null
  union all
  select 'add_usage_credits_service(uuid, uuid, numeric, text) exists (will be replaced, same signature)',
         to_regprocedure('public.add_usage_credits_service(uuid, uuid, numeric, text)') is not null, null
  union all
  select 'deduct_usage_credits(numeric, text) exists (will be frozen, same signature)',
         to_regprocedure('public.deduct_usage_credits(numeric, text)') is not null, null
  union all
  select 'auth.uid() and auth.role() exist',
         to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.role()') is not null, null
  union all
  select 'gen_random_uuid() is available',
         to_regprocedure('gen_random_uuid()') is not null, null

  -- 2. No name collisions: none of the new tables may exist yet.
  union all
  select 'none of the new usage-bucket tables exist yet',
         not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name in (
           'model_prices', 'usage_bucket_products', 'usage_buckets', 'usage_bucket_reservations', 'usage_bucket_events',
           'usage_accounting_discrepancies', 'usage_model_circuit_breakers', 'usage_bucket_revocations',
           'legacy_usage_credit_migrations', 'usage_engine_settings')),
         (select string_agg(table_name, ', ') from information_schema.tables where table_schema = 'public' and table_name in (
           'model_prices', 'usage_bucket_products', 'usage_buckets', 'usage_bucket_reservations', 'usage_bucket_events',
           'usage_accounting_discrepancies', 'usage_model_circuit_breakers', 'usage_bucket_revocations',
           'legacy_usage_credit_migrations', 'usage_engine_settings'))
  union all
  select 'user_usage_credits has no migration columns yet (first run)',
         not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_usage_credits'
                       and column_name in ('migrated_at', 'migrated_bucket_id', 'legacy_balance_usd_at_migration')), null

  -- 3. Legacy liability: expected exactly 1 holder, $10.00 total, $10.00 largest.
  union all
  select 'legacy liability: exactly 1 holder',
         (select count(*) from public.user_usage_credits where balance_usd > 0) = 1,
         (select count(*)::text from public.user_usage_credits where balance_usd > 0)
  union all
  select 'legacy liability: total is $10.00',
         (select coalesce(sum(balance_usd), 0) from public.user_usage_credits where balance_usd > 0) = 10,
         (select coalesce(sum(balance_usd), 0)::text from public.user_usage_credits where balance_usd > 0)
  union all
  select 'legacy liability: largest is $10.00',
         (select coalesce(max(balance_usd), 0) from public.user_usage_credits) = 10,
         (select coalesce(max(balance_usd), 0)::text from public.user_usage_credits)

  -- 4. Informational: what the migration will drop / what exists today.
  union all
  select 'info: pawos_subscriptions check constraints on tier/variant that the migration drops', true,
         (select string_agg(con.conname || ' = ' || pg_get_constraintdef(con.oid), '; ')
            from pg_constraint con join pg_class rel on rel.oid = con.conrelid join pg_namespace n on n.oid = rel.relnamespace
           where n.nspname = 'public' and rel.relname = 'pawos_subscriptions' and con.contype = 'c'
             and (pg_get_constraintdef(con.oid) ~* '\mtier\M' or pg_get_constraintdef(con.oid) ~* 'pro_max_variant'))
  union all
  select 'info: current paid subscriptions by tier/variant (they map to plan products after the migration)', true,
         (select string_agg(k || ': ' || c, ', ') from (
            select tier || coalesce(':' || pro_max_variant, '') as k, count(*) as c from public.pawos_subscriptions
            where current_period_end > now() group by 1) s)
)
select check_name, ok, detail from checks;

-- 5. Preview of the legacy conversion (computed here; the migration's own dry run comes in Phase 3).
--    Expected: one row — $10 customer value, 1,000 PC, $7 private allowance, never expires.
select
  user_id,
  balance_usd                                          as legacy_balance_usd,
  floor(balance_usd * 100)::int                        as customer_value_cents,
  floor(balance_usd * 100)::int                        as customer_pc,
  floor(balance_usd * 1000000 * 0.70)::bigint          as private_allowance_micro_usd,
  'never'                                              as expiry,
  'legacy:user_usage_credits:' || user_id::text        as bucket_key
from public.user_usage_credits
where balance_usd > 0;
