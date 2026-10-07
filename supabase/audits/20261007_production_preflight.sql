-- READ-ONLY. Run in the Supabase SQL editor BEFORE applying the five 20261007 security migrations.
-- It changes nothing. It answers one question: does this database have everything those
-- migrations refer to? The migration files in the repository are not an exact picture of
-- production (for example organizations.seat_count is in the code but was never created there),
-- so this checks the live schema instead of assuming.
--
-- Read the result like this:
--   ok = true                      fine.
--   ok = false, blocking = true    do NOT apply the migrations yet; send this row back for a fix.
--   ok = false, blocking = false   the migrations cope with it (they create it, skip it or read
--                                  around it); it is listed so you know.
--
-- Section 2 looks at the data the migrations will act on. Section 3 reports the tables that exist
-- only in production. Section 4 (the last result) is the summary: what is BLOCKING, what is REVIEW.
-- If you read only one result, read section 4.

with
col(tbl, col) as (
  select c.table_name::text, c.column_name::text from information_schema.columns c where c.table_schema = 'public'
),
fn(name, n) as (
  select p.proname::text, count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' group by 1
),
authfn(name) as (
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth'
),
need_column(migration, tbl, col, blocking, note) as (
  values
    ('1 org tier / admins', 'organizations', 'id', true, 'guard trigger target'),
    ('1 org tier / admins', 'organizations', 'tier', true, 'the column being protected'),
    ('1 org tier / admins', 'organizations', 'owner_user_id', true, 'protected; used by policies'),
    ('1 org tier / admins', 'organizations', 'api_budget_usd', false, 'protected when present'),
    ('1 org tier / admins', 'organizations', 'api_usage_usd', false, 'protected when present'),
    ('1 org tier / admins', 'organization_members', 'organization_id', true, 'tier derivation'),
    ('1 org tier / admins', 'organization_members', 'user_id', true, 'tier derivation'),
    ('1 org tier / admins', 'organization_members', 'status', true, 'tier derivation'),
    ('1 org tier / admins', 'platform_admins', 'email', true, 'locked down by this migration'),
    ('1 org tier / admins', 'user_entitlements', 'user_id', true, 'derived tier is stored here'),
    ('1 org tier / admins', 'user_entitlements', 'tier', true, 'derived tier is stored here'),
    ('1 org tier / admins', 'user_entitlements', 'updated_at', true, 'derived tier is stored here'),
    ('1 org tier / admins', 'pawos_subscriptions', 'user_id', true, 'paid personal plan'),
    ('1 org tier / admins', 'pawos_subscriptions', 'tier', true, 'paid personal plan'),
    ('1 org tier / admins', 'pawos_subscriptions', 'status', true, 'paid personal plan'),
    ('1 org tier / admins', 'pawos_subscriptions', 'current_period_end', true, 'paid personal plan'),
    ('2 seats / admin identity', 'organizations', 'seat_count', false, 'created by migration 2 when missing'),
    ('2 seats / admin identity', 'organization_members', 'id', true, 'seat limit'),
    ('2 seats / admin identity', 'organization_members', 'role', true, 'who may buy seats'),
    ('2 seats / admin identity', 'organization_members', 'seat_tier', true, 'Premium seat limit'),
    ('2 seats / admin identity', 'pawos_admins', 'email', true, 'administrator list'),
    ('3 function hardening', 'autonomous_external_writes', 'id', false, 'skipped when the table is absent'),
    ('3 function hardening', 'autonomous_external_writes', 'created_at', false, 'backfills updated_at'),
    ('3 function hardening', 'autonomous_external_writes', 'completed_at', false, 'backfills updated_at'),
    ('3 function hardening', 'autonomous_external_writes', 'updated_at', false, 'created by migration 3 when missing')
),
need_function(migration, name, blocking, note) as (
  values
    ('2 seats / admin identity', 'pawos_require_build_admin', false, 'admin_add_admin calls it: the migration applies without it, but adding an administrator would fail'),
    ('2 seats / admin identity', 'pawos_normalize_build_email', false, 'admin_add_admin calls it: the migration applies without it, but adding an administrator would fail'),
    ('2 seats / admin identity', 'pawos_admin_log', false, 'admin_add_admin calls it: the migration applies without it, but adding an administrator would fail'),
    ('2 seats / admin identity', 'pawos_is_build_admin', false, 'replaced by migration 2; pawos-web admin routes call it'),
    ('2 seats / admin identity', 'accept_organization_invite', false, 'invite acceptance is held to the seat limit'),
    ('1 org tier / admins', 'is_org_member', false, 'search_path is pinned when present'),
    ('1 org tier / admins', 'sync_my_entitlement_tier', false, 'replaced by migration 1'),
    ('3 function hardening', 'mark_external_write_completed', false, 'made to run as the caller when present'),
    ('4 wallet functions', 'add_ticket_balance', false, 'closed to clients when present'),
    ('4 wallet functions', 'add_task_credits', false, 'closed to clients when present'),
    ('4 wallet functions', 'add_ticket_balance_service', false, 'the server-side crediting path that stays'),
    ('5 usage guard', 'record_enterprise_api_usage', false, 'guarded through its table when present'),
    ('5 usage guard', 'increment_organization_usage', false, 'guarded through its table when present')
)
select 1 as section, n.migration, 'column ' || n.tbl || '.' || n.col as "check",
       exists (select 1 from col c where c.tbl = n.tbl and c.col = n.col) as ok, n.blocking, n.note
from need_column n
union all
select 1, f.migration, 'function public.' || f.name || '()', exists (select 1 from fn where fn.name = f.name), f.blocking, f.note
from need_function f
union all
select 1, 'all', 'function auth.' || a.name || '()', exists (select 1 from authfn where authfn.name = a.name), true, 'Supabase request identity'
from (values ('uid'), ('jwt'), ('role')) a(name)
union all
select 1, 'all', 'roles anon / authenticated / service_role exist',
       (select count(*) = 3 from pg_roles where rolname in ('anon', 'authenticated', 'service_role')), true, 'the guards tell API clients from the server by role'
union all
select 1, '1 org tier / admins', 'organizations.tier allows the free plan ''go''',
       coalesce((select bool_and(pg_get_constraintdef(c.oid) like '%''go''%')
                   from pg_constraint c
                  where c.conrelid = to_regclass('public.organizations') and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tier%'), true),
       false, 'if false, the apps cannot create an organization at all today (they create it as ''go''); unrelated to these migrations'
union all
select 1, 'all', 'no object of the new names exists yet (a first run)',
       not exists (select 1 from pg_trigger where tgname in ('trg_guard_organization_billing_columns', 'trg_guard_organization_member_seats') and not tgisinternal)
       and to_regclass('public.organization_seat_purchases') is null and to_regclass('public.pawos_entitlement_review') is null,
       false, 'false just means the migrations (or part of them) were applied before; they are safe to re-run'
order by ok, blocking desc, migration, "check";

-- ── Section 2: the data the migrations act on ───────────────────────────────────────────────────
-- Run these one at a time. Each needs the tables from section 1; if one fails with "relation does
-- not exist", that table was reported missing above.

-- 2a. Administrators: who will be bound to an account and who will be left without access.
--     "will_bind = false" means that address has no confirmed PawOS account, so after migration 2 it
--     has NO admin access until an administrator re-adds it. Migration 2 refuses to run at all if
--     this shows no address with will_bind = true.
select a.email,
       u.id is not null as has_account,
       u.email_confirmed_at is not null as email_confirmed,
       (u.id is not null and u.email_confirmed_at is not null) as will_bind,
       u.created_at as account_created,
       u.last_sign_in_at
from public.pawos_admins a
left join auth.users u on lower(u.email) = a.email
order by a.email;

-- 2b. Paid organizations as they stand. Nothing here is changed by the migrations. Use it to decide,
--     per organization, what its paid seats really are: after migration 2 a Team organization can
--     have as many active members as seat_count (unlimited while seat_count is empty) and as many
--     Premium members as paid_premium_seats (0 until you set it).
select o.id, o.name, o.tier, o.created_at,
       (select u.email from auth.users u where u.id = o.owner_user_id) as owner_email,
       to_jsonb(o) ->> 'seat_count' as seat_count_today,
       count(m.*) filter (where m.status = 'active') as active_members,
       count(m.*) filter (where m.status = 'invited') as invited_members,
       count(m.*) filter (where m.status in ('active', 'invited') and to_jsonb(m) ->> 'seat_tier' = 'premium') as premium_members
from public.organizations o
left join public.organization_members m on m.organization_id = o.id
where o.tier in ('team', 'enterprise')
group by o.id
order by o.created_at;

-- 2c. Every stored paid tier and what backs it. Migration 1 does NOT change these rows; the ones
--     the server cannot account for are copied to pawos_entitlement_review for you to reconcile.
select e.user_id, (select u.email from auth.users u where u.id = e.user_id) as email, e.tier as stored_tier, e.updated_at,
       exists (select 1 from public.pawos_subscriptions s where s.user_id = e.user_id) as has_any_subscription_record,
       exists (select 1 from public.organization_members m where m.user_id = e.user_id and m.status = 'active') as has_active_membership
from public.user_entitlements e
where e.tier <> 'go'
order by e.tier desc, e.updated_at desc;

-- 2d. Can a signed-in user credit a wallet today without paying? (Closed by migration 4.)
--     callable_by_signed_in_user = true on either row means yes, until that migration is applied.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'execute') as callable_without_sign_in,
       has_function_privilege('authenticated', p.oid, 'execute') as callable_by_signed_in_user
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc')
order by 1;

-- 2e. Wallet top-ups with no Razorpay payment behind them (possible use of the functions in 2d).
--     Legitimate top-ups carry a razorpay_payment_id; the one-time onboarding benefit is recorded as
--     'onetime-benefit-<user id>'. Anything else is for review. Nothing is changed by any migration.
--     (The whole row is shown as JSON because this table's columns differ between environments.)
select (select u.email from auth.users u where u.id = t.user_id) as user_email, to_jsonb(t) as topup
from public.ticket_balance_topups t
where coalesce(to_jsonb(t) ->> 'razorpay_payment_id', '') = ''
  and coalesce(to_jsonb(t) ->> 'payment_reference', '') not like 'onetime-benefit-%';

-- ── Section 3: tables this repository's migrations do not define ────────────────────────────────
-- The website reads and writes these with the signed-in user's own token, so their row level
-- security is the only thing between one organization's data and another's — and it was set up
-- outside the migration files, so it could not be reviewed and NO migration changes it.
-- One row per table. status:
--   BLOCKING  do not go live until fixed: no row level security, readable without sign-in, or a
--             policy that applies to every signed-in user alike
--   REVIEW    policies exist and mention the caller; read each one (listed by the next query)
--   OK        row level security on and no client policy at all — only the server can touch it
with wanted(table_name) as (
  values ('billing_cases'), ('enterprise_pooled_credits'), ('enterprise_pooled_settlements'), ('member_credit_allocations'),
         ('member_credit_requests'), ('organization_logos'), ('payment_events'), ('legal_acceptances')
),
pol as (
  select p.tablename::text as table_name, p.cmd::text as cmd, p.roles,
         -- a policy is "open" when its condition never refers to who is asking
         (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
           !~* 'auth\.uid|auth\.jwt|auth\.role|is_org_|has_capability|is_platform_admin|pawos_is_build_admin|can_manage_billing|current_setting|false' as is_open
  from pg_policies p where p.schemaname = 'public'
),
info as (
  select w.table_name, c.oid,
         c.oid is not null as table_exists,
         coalesce(c.relrowsecurity, false) as rls_enabled,
         (select count(*) from pol where pol.table_name = w.table_name) as policies,
         (select count(*) from pol where pol.table_name = w.table_name and pol.cmd in ('SELECT', 'ALL')) as select_policies,
         (select count(*) from pol where pol.table_name = w.table_name and pol.cmd in ('INSERT', 'ALL')) as insert_policies,
         (select count(*) from pol where pol.table_name = w.table_name and pol.cmd in ('UPDATE', 'ALL')) as update_policies,
         (select count(*) from pol where pol.table_name = w.table_name and pol.cmd in ('DELETE', 'ALL')) as delete_policies,
         (select count(*) from pol where pol.table_name = w.table_name and pol.is_open) as open_policies,
         (select count(*) from pol where pol.table_name = w.table_name and pol.is_open and pol.roles && array['public', 'anon']::name[]) as open_to_anon_policies,
         case when c.oid is null then false else
           has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') end as anon_granted,
         case when c.oid is null then false else
           has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete') end as authenticated_granted
  from wanted w left join pg_class c on c.oid = to_regclass('public.' || w.table_name)
),
judged as (
  select i.*,
         (i.table_exists and i.anon_granted and (not i.rls_enabled or i.open_to_anon_policies > 0)) as anonymous_access,
         (i.table_exists and i.authenticated_granted and (not i.rls_enabled or i.open_policies > 0)) as authenticated_broad_access
  from info i
)
select 3 as section, table_name, table_exists, rls_enabled, policies, select_policies, insert_policies, update_policies, delete_policies,
       anonymous_access, authenticated_broad_access,
       case
         when not table_exists then 'REVIEW: table not found here - the website routes that use it will fail'
         when not rls_enabled and (anon_granted or authenticated_granted) then 'BLOCKING: no row level security'
         when anonymous_access then 'BLOCKING: reachable without signing in'
         when authenticated_broad_access then 'BLOCKING: a policy applies to every signed-in user alike'
         when policies = 0 then 'OK: server-only (row level security on, no client policy)'
         else 'REVIEW: read each policy below - it must limit rows to the caller''s own account or organization'
       end as status
from judged
order by status, table_name;

-- Every policy on those tables, in full, for the REVIEW rows.
select p.tablename, p.policyname, p.cmd, p.roles, p.qual as using_condition, p.with_check as check_condition
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('billing_cases', 'enterprise_pooled_credits', 'enterprise_pooled_settlements', 'member_credit_allocations',
                      'member_credit_requests', 'organization_logos', 'payment_events', 'legal_acceptances')
order by 1, 2;

-- Storage buckets and their policies (org-logos is not defined in the migrations either).
select b.id as bucket, b.public, b.file_size_limit, b.allowed_mime_types from storage.buckets b order by 1;
select policyname, cmd, roles, left(coalesce(qual, '') || ' // ' || coalesce(with_check, ''), 200) as condition
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1;

-- ── Section 4: summary — what stops the release, and what only needs a person to look ───────────
--   BLOCKING  must be resolved before going live. "fixed by" names the migration that resolves it;
--             where it says "send back", stop and report the row instead of applying anything.
--   REVIEW    a person decides; nothing is changed, downgraded or deleted automatically.
--   OK        nothing to do.
-- Also blocking, but not visible to SQL: JIRA_WEBHOOK_SECRET and RAZORPAY_WEBHOOK_SECRET must be
-- set in the website's environment (see the checklist).
with
client_roles(role) as (values ('anon'), ('authenticated')),
fn as (
  select p.oid, p.proname::text as name, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
),
tbl as (
  select c.oid, c.relname::text as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
),
cols as (select table_name::text as tbl, column_name::text as col from information_schema.columns where table_schema = 'public'),
required(tbl, col) as (
  values ('organizations', 'id'), ('organizations', 'tier'), ('organizations', 'owner_user_id'),
         ('organization_members', 'id'), ('organization_members', 'organization_id'), ('organization_members', 'user_id'),
         ('organization_members', 'status'), ('organization_members', 'role'), ('organization_members', 'seat_tier'),
         ('platform_admins', 'email'), ('pawos_admins', 'email'),
         ('user_entitlements', 'user_id'), ('user_entitlements', 'tier'), ('user_entitlements', 'updated_at'),
         ('pawos_subscriptions', 'user_id'), ('pawos_subscriptions', 'tier'), ('pawos_subscriptions', 'status'), ('pawos_subscriptions', 'current_period_end')
),
open_policies as (
  select p.tablename::text as tbl, p.policyname::text as name
  from pg_policies p
  where p.schemaname = 'public'
    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
          !~* 'auth\.uid|auth\.jwt|auth\.role|is_org_|has_capability|is_platform_admin|pawos_is_build_admin|can_manage_billing|current_setting|false'
    and p.policyname <> 'companion_catalog_read' -- a public catalogue, open on purpose
),
summary(item, status, detail, fixed_by) as (
  select 'columns the migrations require',
         case when exists (select 1 from required r where not exists (select 1 from cols c where c.tbl = r.tbl and c.col = r.col)) then 'BLOCKING' else 'OK' end,
         coalesce((select 'missing: ' || string_agg(r.tbl || '.' || r.col, ', ' order by r.tbl, r.col) from required r where not exists (select 1 from cols c where c.tbl = r.tbl and c.col = r.col)), 'all present'),
         'send back - a migration must be corrected first'
  union all
  select 'an administrator account that can be bound',
         case when to_regclass('public.pawos_admins') is null then 'BLOCKING'
              when exists (select 1 from fn where name = 'pawos_is_build_admin') and (select count(*) from cols where tbl = 'pawos_admins' and col = 'email') = 1 then 'OK' else 'BLOCKING' end,
         'run query 2a: at least one address must show will_bind = true, or migration 2 refuses to run', 'have each administrator sign in once'
  union all
  select 'wallet credit without payment',
         case when exists (select 1 from fn f, client_roles r where f.name in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc') and has_function_privilege(r.role, f.oid, 'execute')) then 'BLOCKING' else 'OK' end,
         coalesce((select 'callable by clients: ' || string_agg(distinct f.name, ', ') from fn f, client_roles r where f.name in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc') and has_function_privilege(r.role, f.oid, 'execute')), 'not callable by clients'),
         'migration 4 (can be applied first, on its own)'
  union all
  select 'server-only crediting functions',
         case when exists (select 1 from fn f, client_roles r where f.name in ('add_ticket_balance_service', 'add_usage_credits_service', 'grant_mid_month_bucket_service') and has_function_privilege(r.role, f.oid, 'execute')) then 'BLOCKING' else 'OK' end,
         coalesce((select 'callable by clients: ' || string_agg(distinct f.name, ', ') from fn f, client_roles r where f.name in ('add_ticket_balance_service', 'add_usage_credits_service', 'grant_mid_month_bucket_service') and has_function_privilege(r.role, f.oid, 'execute')), 'service role only'),
         'send back - no migration here changes these'
  union all
  select 'older wallet functions that take a signed amount',
         case when exists (
                select 1 from fn f, client_roles r
                where has_function_privilege(r.role, f.oid, 'execute')
                  and ((f.name in ('reserve_autonomous_pc', 'settle_autonomous_task_run_pc', 'extend_autonomous_reservation') and f.args ~ 'integer')
                       or f.name = 'authorize_autonomous_model_request'))
              and exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.user_task_credits') and a.attname = 'balance_pc' and a.attgenerated = '' and not a.attisdropped)
              then 'BLOCKING' else 'OK' end,
         'earlier versions of the reservation functions do arithmetic on the wallet with the amount they are given, unchecked; they matter only where the wallet still has a writable balance_pc column',
         'send back - needs a look at which versions production really has'
  union all
  select 'tables without row level security',
         case when exists (select 1 from tbl t where not t.rls and t.name <> 'platform_admins' and (has_table_privilege('anon', t.oid, 'select') or has_table_privilege('authenticated', t.oid, 'select'))) then 'BLOCKING' else 'OK' end,
         coalesce((select string_agg(t.name, ', ' order by t.name) from tbl t where not t.rls and t.name <> 'platform_admins' and (has_table_privilege('anon', t.oid, 'select') or has_table_privilege('authenticated', t.oid, 'select'))), 'none'),
         'send back - each needs its own policy decision'
  union all
  select 'administrator list open to clients',
         case when exists (select 1 from tbl t where t.name in ('platform_admins', 'pawos_admins') and (not t.rls or has_table_privilege('authenticated', t.oid, 'select') or has_table_privilege('anon', t.oid, 'select'))) then 'BLOCKING' else 'OK' end,
         coalesce((select string_agg(t.name, ', ' order by t.name) from tbl t where t.name in ('platform_admins', 'pawos_admins') and (not t.rls or has_table_privilege('authenticated', t.oid, 'select') or has_table_privilege('anon', t.oid, 'select'))), 'closed'),
         'migration 1'
  union all
  select 'policies that apply to every caller alike',
         case when exists (select 1 from open_policies) then 'BLOCKING' else 'OK' end,
         coalesce((select string_agg(o.tbl || ' / ' || o.name, ', ' order by o.tbl, o.name) from open_policies o), 'none'),
         'send back - broad access to organization or account data'
  union all
  select 'tier, seats and entitlements writable by clients',
         case when exists (select 1 from pg_trigger where tgname = 'trg_guard_organization_billing_columns' and not tgisinternal)
               and exists (select 1 from pg_trigger where tgname = 'trg_guard_organization_member_seats' and not tgisinternal) then 'OK' else 'BLOCKING' end,
         'the organization and membership guards are ' || case when exists (select 1 from pg_trigger where tgname = 'trg_guard_organization_billing_columns' and not tgisinternal) then 'installed' else 'not installed yet' end,
         'migrations 1 and 2'
  union all
  select 'recorded usage can be lowered',
         case when (not exists (select 1 from cols where tbl = 'organizations' and col = 'api_usage_usd') or exists (select 1 from pg_trigger where tgname = 'trg_guard_organization_api_usage' and not tgisinternal))
               and (to_regclass('public.organization_usage_counters') is null or exists (select 1 from pg_trigger where tgname = 'trg_guard_organization_usage_counter' and not tgisinternal)) then 'OK' else 'BLOCKING' end,
         'negative amounts are accepted by the usage functions until the guard is installed', 'migration 5'
  union all
  select 'Team / Enterprise organizations to confirm', 'REVIEW',
         (select count(*)::text || ' organization(s) - query 2b' from public.organizations o where o.tier in ('team', 'enterprise')), 'a person decides; nothing is downgraded'
  union all
  select 'stored tiers the server cannot account for', 'REVIEW', 'query 2c - copied to pawos_entitlement_review by migration 1, not changed', 'a person reconciles each'
  union all
  select 'existing Premium members and seat counts', 'REVIEW', 'after migration 2, verification query C lists organizations above what is on record as paid', 'set seat_count / paid_premium_seats per organization'
  union all
  select 'wallet top-ups with no payment behind them', 'REVIEW', 'query 2e', 'a person decides; nothing is removed'
  union all
  select 'tables the repository does not define', 'REVIEW', 'section 3 - any row there marked BLOCKING stops the release', 'fix the policy in the dashboard, then re-run'
)
select 4 as section, status, item, detail, fixed_by
from summary
order by case status when 'BLOCKING' then 0 when 'REVIEW' then 1 else 2 end, item;
