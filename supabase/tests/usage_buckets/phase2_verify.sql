-- Phase 2 verification — READ-ONLY. Run AFTER phase2_apply_usage_buckets.sql has committed.
-- One result set: every row should read ok = true ("info" rows describe state and are always true).
with c as (
  -- 1–3. Structure
  select 1 as n, 'all 10 usage-bucket tables exist' as check_name,
         (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (
            'model_prices', 'usage_bucket_products', 'usage_buckets', 'usage_bucket_reservations', 'usage_bucket_events',
            'usage_accounting_discrepancies', 'usage_model_circuit_breakers', 'usage_bucket_revocations',
            'legacy_usage_credit_migrations', 'usage_engine_settings')) = 10 as ok, null::text as detail
  union all
  select 2, 'client functions exist (reserve / settle / release / summary / history)',
         to_regprocedure('public.reserve_usage(text, text, integer, boolean, integer, text, text)') is not null
         and to_regprocedure('public.settle_usage(uuid, text, integer, integer, integer, integer)') is not null
         and to_regprocedure('public.release_usage_reservation(uuid)') is not null
         and to_regprocedure('public.get_my_usage_summary()') is not null
         and to_regprocedure('public.get_my_usage_history(integer)') is not null, null
  union all
  select 3, 'service functions exist (credits, mid-month, revoke, maintenance, breaker reset, legacy migration)',
         to_regprocedure('public.add_usage_credits_service(uuid, uuid, numeric, text)') is not null
         and to_regprocedure('public.pawos_mid_month_offer(uuid)') is not null
         and to_regprocedure('public.grant_mid_month_bucket_service(uuid, text, text, uuid, integer)') is not null
         and to_regprocedure('public.revoke_usage_bucket_service(text, text, text)') is not null
         and to_regprocedure('public.pawos_usage_bucket_maintenance()') is not null
         and to_regprocedure('public.reset_usage_circuit_breaker_service(text)') is not null
         and to_regprocedure('public.migrate_legacy_usage_credits(boolean)') is not null, null
  union all
  select 4, 'clients cannot read usage_buckets / products / prices (RLS on, no client grants)',
         (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('usage_buckets', 'usage_bucket_products', 'model_prices', 'usage_engine_settings'))
         and not has_table_privilege('authenticated', 'public.usage_buckets', 'select')
         and not has_table_privilege('authenticated', 'public.usage_bucket_products', 'select')
         and not has_table_privilege('anon', 'public.model_prices', 'select'), null

  -- 4. Locked product values (customer value / PC / private allowance / pacing / ratio)
  union all
  select 5, 'product rows hold the locked values (7 products)',
         (select count(*) from public.usage_bucket_products where allowance_ratio is null and (product_key, customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd) in (
            ('pro_monthly',           2000,  10000000,  5000000),
            ('pro_max_5x_monthly',    10000, 50000000,  25000000),
            ('pro_max_20x_monthly',   25000, 125000000, 62500000)))
         + (select count(*) from public.usage_bucket_products where (product_key, customer_value_cents, private_allowance_micro_usd) in (
            ('pro_mid_month', 1500, 9000000), ('pro_max_5x_mid_month', 5000, 30000000), ('pro_max_20x_mid_month', 17500, 105000000)))
         + (select count(*) from public.usage_bucket_products where product_key = 'credits' and allowance_ratio = 0.70) = 7
         and (select count(*) from public.usage_bucket_products) = 7,
         (select string_agg(product_key || ' $' || coalesce((customer_value_cents / 100)::text, 'X') || ' / ' || coalesce(customer_value_cents::text, 'X×100') || ' PC', ', ' order by rank, product_key)
            from public.usage_bucket_products)
  union all
  select 6, 'plan → subscription and plan → extra-usage links configured',
         (select count(*) from public.usage_bucket_products where (product_key, subscription_plan_key, extra_usage_product_key) in (
            ('pro_monthly', 'pro', 'pro_mid_month'), ('pro_max_5x_monthly', 'proMax:5x', 'pro_max_5x_mid_month'),
            ('pro_max_20x_monthly', 'proMax:20x', 'pro_max_20x_mid_month'))) = 3, null
  union all
  select 7, 'engine settings: 1024 / 8000 / 10 minutes / $0.001 / 0.5%',
         (select (min_output_tokens, max_output_tokens, reservation_timeout, breaker_single_discrepancy_micro_usd, breaker_aggregate_discrepancy_ratio)
                 = (1024, 8000, interval '10 minutes', 1000::bigint, 0.005::numeric) from public.usage_engine_settings), null
  union all
  select 8, 'model price rows present (6)', (select count(*) from public.model_prices) = 6, null

  -- 5–7. Legacy wallet untouched, nothing migrated, no customer balance changed
  union all
  select 9, 'legacy wallet still $10.000000 and NOT migrated',
         exists (select 1 from public.user_usage_credits where user_id = '446eeaeb-585d-4f9a-a1dc-baa95ce54326'
                   and balance_usd = 10 and migrated_at is null and migrated_bucket_id is null and legacy_balance_usd_at_migration is null),
         (select balance_usd::text || ' / migrated_at=' || coalesce(migrated_at::text, 'null') from public.user_usage_credits where user_id = '446eeaeb-585d-4f9a-a1dc-baa95ce54326')
  union all
  select 10, 'legacy liability unchanged: 1 holder, $10 total',
         (select count(*) from public.user_usage_credits where balance_usd > 0) = 1
         and (select sum(balance_usd) from public.user_usage_credits where balance_usd > 0) = 10, null
  union all
  select 11, 'no wallet migrated yet (no audit rows, no migrated wallets)',
         (select count(*) from public.legacy_usage_credit_migrations) = 0
         and (select count(*) from public.user_usage_credits where migrated_at is not null) = 0, null

  -- 8. No customer usage rows created by the migration itself
  union all
  select 12, 'no buckets / reservations / events / discrepancies / revocations exist yet',
         (select count(*) from public.usage_buckets) = 0 and (select count(*) from public.usage_bucket_reservations) = 0
         and (select count(*) from public.usage_bucket_events) = 0 and (select count(*) from public.usage_accounting_discrepancies) = 0
         and (select count(*) from public.usage_bucket_revocations) = 0 and (select count(*) from public.usage_model_circuit_breakers) = 0,
         (select count(*)::text from public.usage_buckets) || ' buckets'

  -- 9–10. Team / Enterprise and autonomous objects intact
  union all
  select 13, 'autonomous / Ticket Balance objects still present',
         to_regclass('public.user_task_credits') is not null and to_regclass('public.organization_task_credits') is not null
         and to_regclass('public.ticket_balance_topups') is not null and to_regclass('public.autonomous_task_runs') is not null
         and to_regproc('public.reserve_autonomous_pc') is not null and to_regproc('public.settle_autonomous_task_run_pc') is not null
         and to_regproc('public.mark_autonomous_task_completed') is not null and to_regproc('public.add_ticket_balance_service') is not null, null
  union all
  select 14, 'info: Team / Enterprise pooled objects (record_enterprise_api_usage, organization_usage_counters)', true,
         'record_enterprise_api_usage=' || (to_regproc('public.record_enterprise_api_usage') is not null)::text
         || ', organization_usage_counters=' || (to_regclass('public.organization_usage_counters') is not null)::text
  union all
  select 15, 'pawos_subscriptions: current_period_start added, tier/variant checks dropped',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pawos_subscriptions' and column_name = 'current_period_start')
         and not exists (select 1 from pg_constraint con join pg_class rel on rel.oid = con.conrelid join pg_namespace n on n.oid = rel.relnamespace
                         where n.nspname = 'public' and rel.relname = 'pawos_subscriptions' and con.contype = 'c'
                           and (pg_get_constraintdef(con.oid) ~* '\mtier\M' or pg_get_constraintdef(con.oid) ~* 'pro_max_variant')), null
  union all
  select 16, 'deduct_usage_credits is now frozen (body raises legacy_usage_credits_retired)',
         (select prosrc from pg_proc where oid = to_regprocedure('public.deduct_usage_credits(numeric, text)')) like '%legacy_usage_credits_retired%', null
)
select n, check_name, ok, detail from c order by n;
