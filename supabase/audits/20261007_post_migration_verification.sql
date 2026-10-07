-- READ-ONLY. Run in the Supabase SQL editor AFTER applying the five 20261007 security migrations.
-- It changes nothing and attempts nothing: it reads the database's own catalog to confirm that each
-- protection is installed and switched on, and that the old openings are closed.
--
-- Every row should show pass = true. A row with pass = false names what is missing.
--
-- What this proves and what it does not: it proves the guards exist and are configured as the
-- migrations intend. It does not act as an attacker. The attack attempts themselves are in
-- supabase/tests/security_lockdown/run.mjs (a throwaway local database), and the last step of the
-- deployment checklist repeats the main ones against production with a free test account.

with
client_roles(role) as (values ('anon'), ('authenticated')),
fn as (
  select p.oid, p.proname::text as name, p.prosecdef, p.prosrc, coalesce(p.proconfig, '{}'::text[]) as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
trg as (
  select t.tgname::text as name, c.relname::text as tbl, t.tgenabled <> 'D' as enabled, (t.tgtype & 2) = 2 as before_row,
         (t.tgtype & 4) = 4 as on_insert, (t.tgtype & 16) = 16 as on_update
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),
rls as (
  select c.relname::text as tbl, c.relrowsecurity as enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
pol as (
  select tablename::text as tbl, cmd::text as cmd, count(*) as n from pg_policies where schemaname = 'public' group by 1, 2
),
checks(area, "check", pass, detail) as (

  -- ── Normal users cannot create Team / Enterprise organizations or change an organization's tier
  select 'organizations', 'guard trigger is installed, enabled, and fires before INSERT and UPDATE',
         exists (select 1 from trg where name = 'trg_guard_organization_billing_columns' and tbl = 'organizations' and enabled and before_row and on_insert and on_update),
         'trg_guard_organization_billing_columns on public.organizations'
  union all
  select 'organizations', 'guard refuses any tier but ''go'' on a client insert',
         exists (select 1 from fn where name = 'pawos_guard_organization_billing_columns' and prosrc like '%is distinct from ''go''%'),
         'pawos_guard_organization_billing_columns()'
  union all
  select 'organizations', 'guard protects tier, owner, seats, Premium seats, API budget and API usage on a client update',
         exists (select 1 from fn where name = 'pawos_guard_organization_billing_columns'
                   and prosrc like '%''tier''%' and prosrc like '%''owner_user_id''%' and prosrc like '%''seat_count''%'
                   and prosrc like '%''paid_premium_seats''%' and prosrc like '%''api_budget_usd''%' and prosrc like '%''api_usage_usd''%'),
         'the six protected columns'
  union all
  select 'organizations', 'guard runs as the caller (it must see the real role), not as its owner',
         exists (select 1 from fn where name = 'pawos_guard_organization_billing_columns' and not prosecdef), 'SECURITY INVOKER'
  union all
  select 'organizations', 'row level security is on',
         coalesce((select enabled from rls where tbl = 'organizations'), false), 'public.organizations'

  -- ── Normal users cannot read or change platform_admins / pawos_admins
  union all
  select 'administrators', 'platform_admins: row level security is on and it has no client policy',
         coalesce((select enabled from rls where tbl = 'platform_admins'), false) and not exists (select 1 from pol where tbl = 'platform_admins'),
         'no policy = no client access'
  union all
  select 'administrators', 'platform_admins: anon and authenticated hold no privilege at all',
         to_regclass('public.platform_admins') is not null
         and not exists (select 1 from client_roles r, (values ('select'), ('insert'), ('update'), ('delete')) p(priv)
                          where has_table_privilege(r.role, 'public.platform_admins', p.priv)),
         'select / insert / update / delete'
  union all
  select 'administrators', 'pawos_admins: row level security on, no client privilege',
         coalesce((select enabled from rls where tbl = 'pawos_admins'), false)
         and to_regclass('public.pawos_admins') is not null
         and not exists (select 1 from client_roles r, (values ('select'), ('insert'), ('update'), ('delete')) p(priv)
                          where has_table_privilege(r.role, 'public.pawos_admins', p.priv)),
         'public.pawos_admins'
  union all
  select 'administrators', 'the administrator check matches the account id, not an email address',
         exists (select 1 from fn where name = 'pawos_is_build_admin' and prosrc like '%a.user_id = auth.uid()%' and prosrc not like '%lower(u.email)%'),
         'pawos_is_build_admin()'
  union all
  select 'administrators', 'is_platform_admin() only answers about the caller''s own email',
         exists (select 1 from fn where name = 'is_platform_admin' and prosecdef and prosrc like '%auth.jwt()%'), 'is_platform_admin(text)'

  -- ── Normal users cannot set their own entitlement tier
  union all
  select 'entitlements', 'sync_my_entitlement_tier ignores the tier the client sends and stores the derived one',
         exists (select 1 from fn where name = 'sync_my_entitlement_tier' and prosrc like '%pawos_derive_entitlement_tier(v_user_id)%' and prosrc not like '%values (v_user_id, p_tier%'),
         'sync_my_entitlement_tier(text)'
  union all
  select 'entitlements', 'the derivation function cannot be called by clients',
         exists (select 1 from fn where name = 'pawos_derive_entitlement_tier')
         and not exists (select 1 from fn f, client_roles r where f.name = 'pawos_derive_entitlement_tier' and has_function_privilege(r.role, f.oid, 'execute')),
         'pawos_derive_entitlement_tier(uuid)'
  union all
  select 'entitlements', 'user_entitlements: row level security on, clients cannot write it directly',
         coalesce((select enabled from rls where tbl = 'user_entitlements'), false)
         and not exists (select 1 from pol where tbl = 'user_entitlements' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
         'only a SELECT-own policy'
  union all
  select 'entitlements', 'the review list exists and is server-only',
         coalesce((select enabled from rls where tbl = 'pawos_entitlement_review'), false)
         and to_regclass('public.pawos_entitlement_review') is not null
         and not exists (select 1 from client_roles r where has_table_privilege(r.role, 'public.pawos_entitlement_review', 'select')),
         'public.pawos_entitlement_review'

  -- ── Organization admins cannot grant unpaid Premium seats; members cannot exceed paid seats
  union all
  select 'seats', 'seat guard trigger is installed, enabled, and fires before INSERT and UPDATE',
         exists (select 1 from trg where name = 'trg_guard_organization_member_seats' and tbl = 'organization_members' and enabled and before_row and on_insert and on_update),
         'trg_guard_organization_member_seats on public.organization_members'
  union all
  select 'seats', 'seat guard limits Premium members to paid Premium seats and active members to paid seats',
         exists (select 1 from fn where name = 'pawos_guard_organization_member_seats' and prosrc like '%paid_premium_seats%' and prosrc like '%seat_count%' and prosrc like '%pg_advisory_xact_lock%'),
         'pawos_guard_organization_member_seats()'
  union all
  select 'seats', 'seat guard applies to signed-in users even inside privileged functions (invite acceptance)',
         exists (select 1 from fn where name = 'pawos_guard_organization_member_seats' and prosrc like '%auth.role()%'), 'tests the request role'
  union all
  select 'seats', 'only the service role can add paid seats',
         exists (select 1 from fn where name = 'pawos_apply_seat_purchase')
         and not exists (select 1 from fn f, client_roles r where f.name = 'pawos_apply_seat_purchase' and has_function_privilege(r.role, f.oid, 'execute'))
         and exists (select 1 from fn f where f.name = 'pawos_apply_seat_purchase' and has_function_privilege('service_role', f.oid, 'execute') and f.prosrc like '%<> ''service_role''%'),
         'pawos_apply_seat_purchase(...)'
  union all
  select 'seats', 'seat purchase ledger exists, one row per payment, server-only',
         coalesce((select enabled from rls where tbl = 'organization_seat_purchases'), false)
         and to_regclass('public.organization_seat_purchases') is not null
         and not exists (select 1 from client_roles r where has_table_privilege(r.role, 'public.organization_seat_purchases', 'select'))
         and exists (select 1 from pg_constraint where conrelid = to_regclass('public.organization_seat_purchases') and contype = 'p'),
         'public.organization_seat_purchases'
  union all
  select 'seats', 'organizations has seat_count and paid_premium_seats',
         (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name in ('seat_count', 'paid_premium_seats')),
         'columns the payment routes write'

  union all
  select 'seats', 'a plan payment is applied once, by the service role only, and never lowers seat counts',
         exists (select 1 from fn f where f.name = 'pawos_apply_plan_purchase' and has_function_privilege('service_role', f.oid, 'execute')
                   and f.prosrc like '%greatest(coalesce(seat_count, 0), p_seats)%' and f.prosrc like '%on conflict (payment_id) do nothing%')
         and not exists (select 1 from fn f, client_roles r where f.name = 'pawos_apply_plan_purchase' and has_function_privilege(r.role, f.oid, 'execute'))
         and coalesce((select enabled from rls where tbl = 'organization_plan_purchases'), false),
         'pawos_apply_plan_purchase(...), organization_plan_purchases'
  union all
  select 'seats', 'memberships cannot be moved between organizations or accounts, or activated without acceptance',
         exists (select 1 from fn where name = 'pawos_guard_organization_member_seats'
                   and prosrc like '%cannot be moved to another organization%' and prosrc like '%cannot be handed to another account%' and prosrc like '%accepting its own invite%'),
         'pawos_guard_organization_member_seats()'
  union all
  select 'seats', 'only an organization''s owner can grant the owner role or change / remove an owner''s membership',
         exists (select 1 from fn where name = 'pawos_guard_organization_member_seats' and prosrc like '%can grant the owner role%')
         and exists (select 1 from trg where name = 'trg_guard_organization_member_delete' and tbl = 'organization_members' and enabled),
         'insert / update / delete guards on organization_members'

  -- ── Wallets are credited by the server only
  union all
  select 'wallets', 'the old wallet functions are not executable by anon or authenticated',
         not exists (select 1 from fn f, client_roles r
                      where f.name in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc') and has_function_privilege(r.role, f.oid, 'execute')),
         coalesce((select 'still callable: ' || string_agg(distinct f.name, ', ') from fn f, client_roles r
                    where f.name in ('add_ticket_balance', 'add_task_credits', 'reserve_autonomous_task_pc') and has_function_privilege(r.role, f.oid, 'execute')), 'none callable')
  union all
  select 'wallets', 'the server-side crediting functions are service-role only',
         not exists (select 1 from fn f, client_roles r
                      where f.name in ('add_ticket_balance_service', 'add_usage_credits_service', 'grant_mid_month_bucket_service', 'revoke_usage_bucket_service', 'set_user_companion_service')
                        and has_function_privilege(r.role, f.oid, 'execute')),
         'the *_service functions'

  -- ── Recorded usage cannot be lowered by the people it is recorded against
  union all
  select 'usage', 'recorded Enterprise API usage cannot be lowered by a signed-in user',
         not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'api_usage_usd')
         or exists (select 1 from trg where name = 'trg_guard_organization_api_usage' and tbl = 'organizations' and enabled and before_row and on_update),
         'trg_guard_organization_api_usage (passes when the column does not exist)'
  union all
  select 'usage', 'organization usage counters cannot be lowered by a signed-in user',
         to_regclass('public.organization_usage_counters') is null
         or exists (select 1 from trg where name = 'trg_guard_organization_usage_counter' and tbl = 'organization_usage_counters' and enabled and before_row and on_insert and on_update),
         'trg_guard_organization_usage_counter (passes when the table does not exist)'
  union all
  select 'usage', 'the usage guard refuses NULL and any decrease, for requests made with a user token',
         exists (select 1 from fn where name = 'pawos_guard_usage_never_decreases' and prosrc like '%v_new < v_old%' and prosrc like '%v_new is null%' and prosrc like '%auth.role()%'),
         'pawos_guard_usage_never_decreases()'

  -- ── Autonomous-run records cannot be modified across users
  union all
  select 'autonomous runs', 'external-write functions run as the caller, so the table''s own-run policies apply',
         to_regclass('public.autonomous_external_writes') is null
         or (select count(*) = 5 and bool_and(not prosecdef) from fn
              where name in ('get_or_create_external_write_record', 'mark_external_write_completed', 'mark_external_write_failed', 'mark_external_write_reconciling', 'get_completed_external_write')),
         'five functions, SECURITY INVOKER'
  union all
  select 'autonomous runs', 'autonomous_external_writes: row level security on, with select / insert / update policies',
         to_regclass('public.autonomous_external_writes') is null
         or (coalesce((select enabled from rls where tbl = 'autonomous_external_writes'), false)
             and (select count(distinct cmd) = 3 from pol where tbl = 'autonomous_external_writes' and cmd in ('SELECT', 'INSERT', 'UPDATE'))),
         'own-run policies'
  union all
  select 'autonomous runs', 'autonomous_external_writes.updated_at exists, is required and defaults to now()',
         to_regclass('public.autonomous_external_writes') is null
         or exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'autonomous_external_writes' and column_name = 'updated_at' and is_nullable = 'NO' and column_default is not null),
         'the column the three writer functions set'

  -- ── Privileged functions have a safe search_path
  union all
  select 'functions', 'every SECURITY DEFINER function in public has a fixed search_path',
         not exists (select 1 from fn where prosecdef and not exists (select 1 from unnest(config) c where c like 'search_path=%')),
         coalesce((select 'missing on: ' || string_agg(name, ', ' order by name) from fn where prosecdef and not exists (select 1 from unnest(config) c where c like 'search_path=%')), 'none missing')

  -- ── Required row level security and policies
  union all
  select 'row level security', 'on for ' || t.tbl, coalesce((select enabled from rls where rls.tbl = t.tbl), false), 'required'
  from (values ('organizations'), ('organization_members'), ('user_entitlements'), ('platform_admins'), ('pawos_admins'), ('pawos_subscriptions'),
               ('connectivity_credentials'), ('web_chats'), ('web_chat_messages'), ('organization_seat_purchases'), ('pawos_entitlement_review')) t(tbl)
  union all
  select 'row level security', 'no table in public is without row level security',
         not exists (select 1 from rls where not enabled),
         coalesce((select 'without it: ' || string_agg(tbl, ', ' order by tbl) from rls where not enabled), 'none')
  union all
  select 'policies', 'organizations has its select / insert / update / delete policies',
         (select count(distinct cmd) = 4 from pol where tbl = 'organizations' and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')), 'org_select_own, org_insert_authenticated, org_update_owner, org_delete_owner'
  union all
  select 'policies', 'organization_members has a select policy and a manage policy',
         exists (select 1 from pol where tbl = 'organization_members' and cmd = 'SELECT') and exists (select 1 from pol where tbl = 'organization_members' and cmd = 'ALL'),
         'org_members_select_own_org, org_members_manage_own_org'
  union all
  select 'policies', 'pawos_subscriptions cannot be read or written directly by clients',
         to_regclass('public.pawos_subscriptions') is not null
         and not exists (select 1 from client_roles r, (values ('select'), ('insert'), ('update'), ('delete')) p(priv) where has_table_privilege(r.role, 'public.pawos_subscriptions', p.priv)),
         'paid plans are server-written'
)
select area, "check", pass, detail
from checks
order by pass, area, "check";

-- ── Whole-database sweep ────────────────────────────────────────────────────────────────────────
-- Production has tables and functions that no migration file defines (billing_cases,
-- enterprise_pooled_credits, member_credit_allocations, member_credit_requests, organization_logos,
-- payment_events, legal_acceptances, ...), so they could not be reviewed from the repository.
-- These three queries review whatever is really there. Each row is something to look at;
-- an empty result is the good answer.

-- S1. Tables that API clients can reach with NO row level security.
select c.relname as table_without_rls,
       has_table_privilege('anon', c.oid, 'select') as anon_can_read,
       has_table_privilege('authenticated', c.oid, 'select') as signed_in_can_read,
       has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete') as signed_in_can_write
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- S2. Policies that do not depend on who is asking (they apply to every caller alike).
--     companion_catalog_read is expected: it is a public catalogue.
select tablename, policyname, cmd, roles, left(coalesce(qual, '') || ' // ' || coalesce(with_check, ''), 160) as condition
from pg_policies
where schemaname in ('public', 'storage')
  and (coalesce(qual, '') || coalesce(with_check, '')) !~* 'auth\.uid|auth\.jwt|auth\.role|is_org_|has_capability|is_platform_admin|pawos_is_build_admin|can_manage_billing|current_setting|false'
order by 1, 2;

-- S3. Functions that run with their owner's rights, can be called by API clients, and never look
--     at who is calling. Expected here (each answers only a yes/no or public question):
--     can_manage_billing_data, is_org_admin, is_org_manager, is_org_member, requires_approval,
--     get_public_profile, pawos_billing_switch, upsert_diagnostic_issue, validate_mobile_session,
--     verify_pairing_security_key, seed_work_os_role_capabilities, deduct_usage_credits (retired:
--     always raises). Anything else — above all anything that credits, grants or changes a plan —
--     must be reviewed before going live.
select p.proname as function, left(pg_get_function_identity_arguments(p.oid), 100) as arguments,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_call
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prokind = 'f' and pg_get_function_result(p.oid) <> 'trigger'
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  and p.prosrc !~* 'auth\.uid|auth\.role|auth\.jwt|pawos_require|pawos_is_build_admin|pawos_caller_email|has_capability|pawos_can_act_on_run|is_org_member|is_org_admin|is_org_manager'
order by 1;

-- Accounts and organizations a person still needs to look at (also read-only):

-- A. Stored tiers the server could not account for. Reconcile each, then mark it resolved
--    (the two statements to use are in migration 20261007000000, section 3).
select r.user_id, (select u.email from auth.users u where u.id = r.user_id) as email, r.stored_tier, r.derived_tier, r.flagged_at
from public.pawos_entitlement_review r
where r.resolved_at is null
order by r.stored_tier desc, r.flagged_at;

-- B. Administrators and the account each is bound to.
select a.email, a.user_id is not null as bound, (select u.last_sign_in_at from auth.users u where u.id = a.user_id) as last_sign_in
from public.pawos_admins a
order by a.email;

-- C. Paid organizations whose members exceed what is on record as paid. Nothing was removed;
--    set seat_count / paid_premium_seats to what each organization actually bought.
select o.id, o.name, o.tier, o.seat_count, o.paid_premium_seats,
       count(*) filter (where m.status = 'active') as active_members,
       count(*) filter (where m.status in ('active', 'invited') and m.seat_tier = 'premium') as premium_members
from public.organizations o
left join public.organization_members m on m.organization_id = o.id
where o.tier in ('team', 'enterprise')
group by o.id
having count(*) filter (where m.status = 'active') > coalesce(o.seat_count, 2147483647)
    or count(*) filter (where m.status in ('active', 'invited') and m.seat_tier = 'premium') > o.paid_premium_seats
order by o.created_at;
