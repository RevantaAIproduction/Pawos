-- Account deletion (Settings → Delete account on PawOS Web, /api/dashboard/account).
--
-- The web route deletes the user with auth.admin.deleteUser(). Every foreign key to auth.users
-- created without an ON DELETE rule (NO ACTION) makes that delete fail as soon as the user has a row
-- in that table — e.g. autonomous_task_runs or diagnostic_reports. This gives each of them a rule:
--   - a nullable column (created_by, decided_by, assigned_to, ...) → ON DELETE SET NULL, so shared
--     records (an organization's tasks, documents, audit log) stay and simply lose the author link;
--   - a NOT NULL column (the row belongs to that user) → ON DELETE CASCADE.
-- Keys that already have a rule (CASCADE / SET NULL) are left as they are. Only foreign keys whose
-- delete action is NO ACTION ('a') or RESTRICT ('r') are touched, so re-running this is a no-op.
--
-- organizations.owner_user_id becomes CASCADE, but the route refuses to delete an account that owns
-- an organization, so an organization is never removed by this path.

do $$
declare
  fk record;
  col_nullable boolean;
  rule text;
begin
  for fk in
    select con.conname, con.conrelid, nsp.nspname as schema_name, rel.relname as table_name, att.attname as column_name, att.attnotnull
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and con.confdeltype in ('a', 'r')
      and array_length(con.conkey, 1) = 1
      and nsp.nspname not in ('auth', 'storage')
  loop
    col_nullable := not fk.attnotnull;
    rule := case when col_nullable then 'set null' else 'cascade' end;
    execute format('alter table %I.%I drop constraint %I', fk.schema_name, fk.table_name, fk.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      fk.schema_name, fk.table_name, fk.conname, fk.column_name, rule
    );
  end loop;
end
$$;
