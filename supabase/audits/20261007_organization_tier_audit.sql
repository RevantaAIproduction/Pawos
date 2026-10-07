-- READ-ONLY. Run in the Supabase SQL editor before and after applying
-- 20261007000000_security_org_tier_and_admin_lockdown.sql. Changes nothing.
--
-- Until that migration, any signed-in user could create a Team / Enterprise organization, or put
-- their own email in platform_admins, with a direct API request. These queries show what to review.

-- 1. Team / Enterprise organizations and whether the owner has a payment on record.
--    "payments_by_owner = 0" is not proof of abuse (manual / invoiced deals, internal test
--    organizations) — it is the list to check by hand.
select
  o.id,
  o.name,
  o.slug,
  o.tier,
  o.created_at,
  u.email as owner_email,
  (select count(*) from public.payment_events p where p.user_id = o.owner_user_id) as payments_by_owner,
  (select count(*) from public.organization_members m where m.organization_id = o.id and m.status = 'active') as active_members
from public.organizations o
left join auth.users u on u.id = o.owner_user_id
where o.tier in ('team', 'enterprise')
order by payments_by_owner asc, o.created_at desc;

-- 2. Administrator lists. Every address here should be one you put there.
select 'platform_admins' as list, email, added_at as since from public.platform_admins
union all
select 'pawos_admins', email, null from public.pawos_admins
order by 1, 2;

-- 3. Is platform_admins protected? Before the migration: rls_enabled = false and client grants
--    listed. After: rls_enabled = true and no rows from the second query.
select relrowsecurity as rls_enabled from pg_class where oid = 'public.platform_admins'::regclass;
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'platform_admins' and grantee in ('anon', 'authenticated', 'PUBLIC');

-- 4. Stored entitlement tiers that do not match what the account has actually paid for or joined.
--    The migration does not rewrite them: it copies them to pawos_entitlement_review for manual
--    reconciliation. Each account's stored tier is replaced by the derived one at its next sign-in.
with derived as (
  select
    e.user_id,
    e.tier as stored_tier,
    coalesce(
      (select o.tier
         from public.organization_members m
         join public.organizations o on o.id = m.organization_id
        where m.user_id = e.user_id and m.status = 'active' and o.tier in ('team', 'enterprise')
        order by case o.tier when 'enterprise' then 2 else 1 end desc
        limit 1),
      (select s.tier
         from public.pawos_subscriptions s
        where s.user_id = e.user_id
          and s.status in ('active', 'authenticated', 'pending', 'cancelled', 'completed')
          and s.current_period_end > now()
        order by case when s.tier = 'proMax' then 2 else 1 end desc, s.current_period_end desc
        limit 1),
      'go'
    ) as derived_tier
  from public.user_entitlements e
)
select d.user_id, u.email, d.stored_tier, d.derived_tier
from derived d
left join auth.users u on u.id = d.user_id
where d.stored_tier is distinct from d.derived_tier
order by d.stored_tier desc;

-- 5. Administrator accounts (20261007010000). After that migration each administrator is one bound
--    account. Check every bound account is the person you expect — the binding was made from the
--    address's account as it stood when the migration ran — and note any address left unbound
--    (it has no admin access until an administrator adds it again).
--    Before the migration the user_id column does not exist; run this one afterwards.
select a.email, a.user_id, u.created_at as account_created, u.last_sign_in_at,
       case when a.user_id is null then 'NOT BOUND - no admin access' else 'bound' end as state
from public.pawos_admins a
left join auth.users u on u.id = a.user_id
order by a.email;

-- 6. Team organizations: seats in use against seats paid for, and Premium seats assigned without a
--    Premium purchase on record (20261007010000 stops new ones; existing rows are not changed).
select o.id, o.name, o.tier,
       to_jsonb(o) ->> 'seat_count' as paid_seats,
       to_jsonb(o) ->> 'paid_premium_seats' as paid_premium_seats,
       count(*) filter (where m.status = 'active') as active_members,
       count(*) filter (where m.status = 'active' and m.seat_tier = 'premium') as premium_members
from public.organizations o
left join public.organization_members m on m.organization_id = o.id
where o.tier in ('team', 'enterprise')
group by o.id
order by o.created_at desc;
