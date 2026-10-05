-- Scenarios for give_paw_compute(); each line says what to expect. Run after the fixture and the migration.
\set ON_ERROR_STOP 0
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001','admin@acme.com'),('aaaaaaaa-0000-0000-0000-000000000002','dev@acme.com'),('aaaaaaaa-0000-0000-0000-000000000003','ws@acme.com'),('aaaaaaaa-0000-0000-0000-000000000004','x@other.com');
insert into public.organizations values ('bbbbbbbb-0000-0000-0000-000000000001','Acme','team','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.organization_members (organization_id,user_id,email,role,status) values
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','admin@acme.com','owner','active'),
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','dev@acme.com','member','active'),
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003','ws@acme.com','workspaceAdministrator','active');
-- Admin bought $20 of Paw Compute (2,000 PC) and also has a Pro plan bucket.
insert into public.usage_buckets (user_id, source_type, product_key, purchase_ref, customer_value_cents, customer_pc, private_allowance_micro_usd, period_start)
 values ('aaaaaaaa-0000-0000-0000-000000000001','purchased_credits','credits','pay:1',2000,2000,14000000,now());
insert into public.usage_buckets (user_id, source_type, product_key, purchase_ref, subscription_id, customer_value_cents, customer_pc, private_allowance_micro_usd, weekly_pacing_micro_usd, period_start, expires_at)
 values ('aaaaaaaa-0000-0000-0000-000000000001','monthly_plan','pro_monthly','sub:1','sub1',2000,2000,10000000,5000000,now(),now()+interval '30 days');

set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
\echo '1 admin givable (expect 2000):'
select public.get_my_givable_paw_compute();
\echo '2 admin gives 500 to dev:'
select public.give_paw_compute('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002',500,'For the release') - 'gift_id';
\echo '3 admin tries 2000 more (expect: You have 1500 ...):'
select public.give_paw_compute('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002',2000);
\echo '4 give to self (expect refused):'
select public.give_paw_compute('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',10);
\echo '5 give to someone outside the org (expect refused):'
select public.give_paw_compute('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000004',10);
\echo '6 direct insert into history (expect permission denied):'
insert into public.organization_paw_compute_gifts (organization_id, given_by, given_to, pc) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002',99999);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
\echo '7 member tries to give (expect only owner/billing):'
select public.give_paw_compute('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003',1);
\echo '8 member sees their gift (expect 1 row, 500):'
select pc, note from public.organization_paw_compute_gifts;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000003',false);
\echo '9 workspace admin tries to give (expect refused) and sees no gifts (expect 0):'
select public.give_paw_compute('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002',1);
select count(*) from public.organization_paw_compute_gifts;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000004',false);
\echo '10 outsider sees no gifts (expect 0):'
select count(*) from public.organization_paw_compute_gifts;
reset role;
\echo '11 buckets after (admin credits used 3500000; dev bucket 500 PC / 3500000; plan untouched):'
select u.email, b.product_key, b.customer_pc, b.private_allowance_micro_usd, b.consumed_micro_usd, b.metadata->>'given_pc' given from public.usage_buckets b join auth.users u on u.id=b.user_id order by u.email, b.product_key;
\echo '12 value conserved (moved micro = new bucket allowance):'
select (select sum(consumed_micro_usd) from public.usage_buckets where product_key='credits') = (select sum(private_allowance_micro_usd) from public.usage_buckets where product_key='org_given_credits') as conserved;
