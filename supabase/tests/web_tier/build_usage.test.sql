-- web_build_usage: service-role written, never readable or writable by signed-in users.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'build@example.com') on conflict do nothing;

do $$
begin
  set local role service_role;
  insert into public.web_build_usage (user_id, request_key, pc, input_tokens, output_tokens)
    values ('00000000-0000-0000-0000-0000000000b1', 'web-chat:req-1', 1.25, 100, 200);
  begin
    insert into public.web_build_usage (user_id, request_key, pc) values ('00000000-0000-0000-0000-0000000000b1', 'web-chat:req-1', 9);
    raise exception 'FAIL  a request key was recorded twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.web_build_usage (user_id, request_key, pc) values ('00000000-0000-0000-0000-0000000000b1', 'web-chat:neg', -1);
    raise exception 'FAIL  negative usage was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS  service role records usage once per request key, never negative';
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    perform count(*) from public.web_build_usage;
    raise exception 'FAIL  a signed-in user could read web_build_usage';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.web_build_usage (user_id, request_key, pc) values ('00000000-0000-0000-0000-0000000000b1', 'forged', 0);
    raise exception 'FAIL  a signed-in user could write web_build_usage';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS  signed-in users can neither read nor write Web usage records';
end $$;

do $$
begin
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
  if exists (select 1 from public.web_build_usage where user_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL  usage records outlived the account';
  end if;
  raise notice 'PASS  usage records go with the account';
end $$;
