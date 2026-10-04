-- Runs AFTER 20261004010000_web_chat.sql and BEFORE 20261004020000_web_tier_architecture.sql:
-- data written the old way, so the new migration's backfill is exercised.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'legacy@example.com');

set role service_role;
set request.jwt.claim.role = 'service_role';
select public.web_chat_append_exchange('00000000-0000-0000-0000-00000000000a', null, 'legacy one', 'reply', 4, 'legacy-req-0001');
select public.web_chat_append_exchange('00000000-0000-0000-0000-00000000000a', null, 'legacy two', 'reply', 4, 'legacy-req-0002');
select public.web_chat_append_exchange('00000000-0000-0000-0000-00000000000a', null, 'legacy three', 'reply', 4, 'legacy-req-0003');
reset role;
reset request.jwt.claim.role;
