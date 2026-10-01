-- Phase 2 before/after snapshot — READ-ONLY. Run once BEFORE phase2_apply_usage_buckets.sql and once
-- AFTER it; save both outputs. Every row must be identical in both runs EXCEPT:
--   public_tables     +10   (the ten usage-bucket tables)
--   public_functions  +25   (27 functions defined; add_usage_credits_service and deduct_usage_credits
--                            already exist and are replaced in place, so 25 are new)
-- Fingerprints are md5 hashes of the row data, so any changed balance or row shows up as a different
-- value. Tables that don't exist report 'absent' (same in both runs).
with t(item, val) as (
  select 'public_tables',
         (select count(*)::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
  union all
  select 'public_functions',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')
  union all
  select 'user_usage_credits (count | sum balance | fingerprint)',
         (select count(*)::text || ' | ' || coalesce(sum(balance_usd), 0)::text || ' | '
                 || coalesce(md5(string_agg(user_id::text || ':' || balance_usd::text || ':' || updated_at::text, ',' order by user_id)), '-')
            from public.user_usage_credits)
  union all
  select 'usage_credit_payments / usage_credit_deductions (counts)',
         (select count(*)::text from public.usage_credit_payments) || ' / ' || (select count(*)::text from public.usage_credit_deductions)
  union all
  select 'pawos_subscriptions (count | fingerprint)',
         (select count(*)::text || ' | ' || coalesce(md5(string_agg(id || ':' || user_id::text || ':' || tier || ':' || coalesce(pro_max_variant, '') || ':'
                 || status || ':' || coalesce(current_period_end::text, '') || ':' || billing_frequency, ',' order by id)), '-')
            from public.pawos_subscriptions)
  union all
  select 'user_task_credits (count | sum balance | sum reserved | fingerprint)',
         case when to_regclass('public.user_task_credits') is null then 'absent' else
           (xpath('/row/v/text()', query_to_xml(
              'select count(*)::text || '' | '' || coalesce(sum(balance_usd),0)::text || '' | '' || coalesce(sum(reserved_usd),0)::text || '' | ''
                      || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') as v from public.user_task_credits t', false, true, '')))[1]::text end
  union all
  select 'organization_task_credits (count | sum balance | sum reserved | fingerprint)',
         case when to_regclass('public.organization_task_credits') is null then 'absent' else
           (xpath('/row/v/text()', query_to_xml(
              'select count(*)::text || '' | '' || coalesce(sum(balance_usd),0)::text || '' | '' || coalesce(sum(reserved_usd),0)::text || '' | ''
                      || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') as v from public.organization_task_credits t', false, true, '')))[1]::text end
  union all
  select 'ticket_balance_topups (count | fingerprint)',
         case when to_regclass('public.ticket_balance_topups') is null then 'absent' else
           (xpath('/row/v/text()', query_to_xml(
              'select count(*)::text || '' | '' || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') as v from public.ticket_balance_topups t', false, true, '')))[1]::text end
  union all
  select 'autonomous_task_runs (count | fingerprint)',
         case when to_regclass('public.autonomous_task_runs') is null then 'absent' else
           (xpath('/row/v/text()', query_to_xml(
              'select count(*)::text || '' | '' || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') as v from public.autonomous_task_runs t', false, true, '')))[1]::text end
  union all
  select 'organization_usage_counters (count | fingerprint)',
         case when to_regclass('public.organization_usage_counters') is null then 'absent' else
           (xpath('/row/v/text()', query_to_xml(
              'select count(*)::text || '' | '' || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') as v from public.organization_usage_counters t', false, true, '')))[1]::text end
  union all
  select 'autonomous / enterprise function definitions (fingerprint)',
         (select coalesce(md5(string_agg(p.oid::regprocedure::text || md5(p.prosrc), ',' order by p.oid::regprocedure::text)), '-')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname ~ 'autonomous|ticket' or p.proname in ('record_enterprise_api_usage', 'add_ticket_balance_service')))
)
select item, val from t;
