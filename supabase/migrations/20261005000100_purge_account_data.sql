-- Account deletion: remove everything PawOS stores about the person, not only rows that hang off
-- auth.users through a foreign key. Called by the web route (/api/dashboard/account, see
-- pawos-web/src/lib/account/accountDeletion.ts) with the service role, right before
-- auth.admin.deleteUser(); only after the route confirmed nothing is owed.
--
-- Removes, across every table in the public schema:
--   - every row the account owns: any column named user_id, owner_user_id, actor_user_id, actor_id,
--     requester_user_id, referrer_user_id, referred_user_id or target_user_id equal to the account
--     (uuid or text, with or without a foreign key) — chats, usage, credits, subscriptions,
--     payments, top-ups, invoices/billing cases, devices, sessions, referrals, audit entries, ...;
--   - every row holding the account's email in a column ending in "email" (waitlists, early
--     access, ratings, organization invites, billing cases by billing_email, admin grants, ...);
--   - the account's id from any uuid[] column (e.g. organization_teams.member_user_ids).
-- An organization's own shared projects and documents stay (their author link is cleared by the
-- ON DELETE SET NULL rules of 20261005000000), and organizations themselves are never removed here:
-- the route refuses to delete an account that owns one.
--
-- Rows are deleted in repeated passes so a parent row whose children are removed later in the same
-- pass is retried on the next one, whatever the order of the tables.

create or replace function public.purge_account_data(p_user_id uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_owner_columns text[] := array['user_id', 'owner_user_id', 'actor_user_id', 'actor_id', 'requester_user_id', 'referrer_user_id', 'referred_user_id', 'target_user_id'];
  v_keep_tables text[] := array['organizations', 'workspace_projects', 'workspace_documents'];
  v_statements text[] := array[]::text[];
  v_pending text[];
  v_stmt text;
  v_rows integer;
  v_total integer := 0;
  v_pass integer := 0;
  r record;
begin
  if p_user_id is null then
    raise exception 'purge_account_data: p_user_id is required';
  end if;

  -- Take the account out of uuid[] membership lists.
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.udt_name = '_uuid'
  loop
    execute format('update public.%I set %I = array_remove(%I, $1) where $1 = any(%I)', r.table_name, r.column_name, r.column_name, r.column_name) using p_user_id;
  end loop;

  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.column_name = any (v_owner_columns)
      and c.table_name <> all (v_keep_tables)
  loop
    v_statements := v_statements || format('delete from public.%I where %I::text = %L', r.table_name, r.column_name, p_user_id::text);
  end loop;

  if v_email <> '' then
    for r in
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and c.column_name ~ 'email$'
        and c.data_type in ('text', 'character varying', 'USER-DEFINED')
        and c.table_name <> all (v_keep_tables)
    loop
      v_statements := v_statements || format('delete from public.%I where lower(trim(%I::text)) = %L', r.table_name, r.column_name, v_email);
    end loop;
  end if;

  v_pending := v_statements;
  while array_length(v_pending, 1) > 0 and v_pass < 10 loop
    v_pass := v_pass + 1;
    v_statements := v_pending;
    v_pending := array[]::text[];
    foreach v_stmt in array v_statements loop
      begin
        execute v_stmt;
        get diagnostics v_rows = row_count;
        v_total := v_total + v_rows;
      exception when foreign_key_violation then
        v_pending := v_pending || v_stmt; -- another row still points at this one; retry next pass
      end;
    end loop;
  end loop;

  if array_length(v_pending, 1) > 0 then
    raise exception 'purge_account_data: could not remove all data (%)', array_to_string(v_pending, '; ');
  end if;
  return v_total;
end;
$$;

revoke all on function public.purge_account_data(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.purge_account_data(uuid, text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.purge_account_data(uuid, text) to service_role';
  end if;
end
$$;
