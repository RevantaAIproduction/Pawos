-- Ticket evidence, Phase 2 — durable before/after evidence attached to the EXISTING run record.
--
-- Additive only: two nullable columns on autonomous_task_runs, one new table, one private storage
-- bucket, and three functions. No existing column, row, balance, charge, status, PR URL,
-- files_changed or lines_changed is dropped, rewritten or migrated.
--
-- Evidence is strictly owned by its parent run's owner: only the run's owner can attach evidence to
-- it or read it (in the table and in storage). Nothing here touches billing: the only update this
-- migration ever makes to autonomous_task_runs is ticket_title / fix_summary, and the billing
-- trigger (trg_autonomous_run_billing) fires only on `update of status`.

-- 1. Descriptive run details for the Ticket Wallet history ------------------------------------------
alter table public.autonomous_task_runs add column if not exists ticket_title text;
alter table public.autonomous_task_runs add column if not exists fix_summary text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'autonomous_task_runs_ticket_title_len') then
    alter table public.autonomous_task_runs
      add constraint autonomous_task_runs_ticket_title_len check (ticket_title is null or char_length(ticket_title) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autonomous_task_runs_fix_summary_len') then
    alter table public.autonomous_task_runs
      add constraint autonomous_task_runs_fix_summary_len check (fix_summary is null or char_length(fix_summary) <= 1000);
  end if;
end
$$;

-- Owner-only, details-only writer. Touches ticket_title / fix_summary and nothing else — never status,
-- charged_usd, reserved_usd, balances or any billing column. null leaves a value as it is.
create or replace function public.record_autonomous_run_details(p_run_id uuid, p_ticket_title text, p_fix_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.autonomous_task_runs where id = p_run_id and user_id = v_uid) then
    raise exception 'Run not found' using errcode = '42501';
  end if;
  update public.autonomous_task_runs
     set ticket_title = coalesce(nullif(left(btrim(p_ticket_title), 300), ''), ticket_title),
         fix_summary = coalesce(nullif(left(btrim(p_fix_summary), 1000), ''), fix_summary)
   where id = p_run_id
     and user_id = v_uid;
end;
$$;

revoke all on function public.record_autonomous_run_details(uuid, text, text) from public, anon;
grant execute on function public.record_autonomous_run_details(uuid, text, text) to authenticated;

-- 2. Evidence rows, owned by the parent run ---------------------------------------------------------
create table if not exists public.autonomous_run_evidence (
  -- Supplied by PawOS (the same id as the local capture and the storage object name).
  id uuid primary key,
  run_id uuid not null references public.autonomous_task_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phase text not null check (phase in ('before', 'after')),
  -- 'image' = a screenshot (web page, app window, device); 'output' = command/log/API output text.
  kind text not null check (kind in ('image', 'output')),
  provider text not null check (provider in ('web', 'desktopWindow', 'android', 'iosSimulator', 'output')),
  label text not null check (char_length(label) between 1 and 160),
  target_description text not null default '' check (char_length(target_description) <= 500),
  storage_path text,
  output_source text check (output_source is null or char_length(output_source) <= 500),
  output_status integer,
  output_text text check (output_text is null or char_length(output_text) <= 8000),
  page_signals jsonb,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint autonomous_run_evidence_shape check (
    (kind = 'image' and storage_path is not null and output_text is null and provider <> 'output')
    or (kind = 'output' and storage_path is null and output_text is not null and provider = 'output')
  )
);

create index if not exists idx_autonomous_run_evidence_run on public.autonomous_run_evidence(run_id, captured_at);

alter table public.autonomous_run_evidence enable row level security;

-- Reads only; every write goes through add_autonomous_run_evidence(). No update/delete for users.
revoke all on public.autonomous_run_evidence from anon;
revoke insert, update, delete, truncate on public.autonomous_run_evidence from authenticated;
grant select on public.autonomous_run_evidence to authenticated;

drop policy if exists autonomous_run_evidence_select_owner on public.autonomous_run_evidence;
create policy autonomous_run_evidence_select_owner on public.autonomous_run_evidence
  for select to authenticated using (
    user_id = auth.uid()
    and exists (select 1 from public.autonomous_task_runs r where r.id = run_id and r.user_id = auth.uid())
  );

-- The only way to attach evidence: the caller must own the run; an image must already be stored at
-- exactly <owner>/<run>/<evidence id>.png; at most 20 items per run. Idempotent on the evidence id
-- for the same run and owner. Writes nothing but this one evidence row.
create or replace function public.add_autonomous_run_evidence(
  p_id uuid,
  p_run_id uuid,
  p_phase text,
  p_kind text,
  p_provider text,
  p_label text,
  p_target_description text,
  p_storage_path text,
  p_output_source text,
  p_output_status integer,
  p_output_text text,
  p_page_signals jsonb,
  p_captured_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.autonomous_run_evidence%rowtype;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.autonomous_task_runs where id = p_run_id and user_id = v_uid) then
    raise exception 'Run not found' using errcode = '42501';
  end if;

  select * into v_existing from public.autonomous_run_evidence where id = p_id;
  if found then
    if v_existing.run_id = p_run_id and v_existing.user_id = v_uid then
      return p_id;
    end if;
    raise exception 'Evidence id already used' using errcode = '42501';
  end if;

  if (select count(*) from public.autonomous_run_evidence where run_id = p_run_id) >= 20 then
    raise exception 'Evidence limit reached for this run' using errcode = '54000';
  end if;

  if p_kind = 'image' then
    if p_storage_path is distinct from format('%s/%s/%s.png', v_uid, p_run_id, p_id) then
      raise exception 'Invalid evidence storage path' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'ticket-evidence' and name = p_storage_path) then
      raise exception 'Evidence image has not been uploaded' using errcode = '22023';
    end if;
  end if;

  insert into public.autonomous_run_evidence (
    id, run_id, user_id, phase, kind, provider, label, target_description, storage_path,
    output_source, output_status, output_text, page_signals, captured_at
  ) values (
    p_id, p_run_id, v_uid, p_phase, p_kind, p_provider, left(btrim(p_label), 160),
    left(coalesce(p_target_description, ''), 500), p_storage_path,
    left(p_output_source, 500), p_output_status, left(p_output_text, 8000), p_page_signals, p_captured_at
  );
  return p_id;
end;
$$;

revoke all on function public.add_autonomous_run_evidence(uuid, uuid, text, text, text, text, text, text, text, integer, text, jsonb, timestamptz) from public, anon;
grant execute on function public.add_autonomous_run_evidence(uuid, uuid, text, text, text, text, text, text, text, integer, text, jsonb, timestamptz) to authenticated;

-- 3. Private storage for evidence images -------------------------------------------------------------
-- Never public; PNG only; 5 MB each. Objects live at <owner id>/<run id>/<evidence id>.png. Viewing
-- is through short-lived signed URLs, which need read access (the policy below) to be issued.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-evidence', 'ticket-evidence', false, 5242880, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ticket_evidence_insert_owner on storage.objects;
create policy ticket_evidence_insert_owner on storage.objects
  for insert to authenticated with check (
    bucket_id = 'ticket-evidence'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.autonomous_task_runs r
       where r.id::text = (storage.foldername(name))[2]
         and r.user_id = auth.uid()
    )
  );

drop policy if exists ticket_evidence_select_owner on storage.objects;
create policy ticket_evidence_select_owner on storage.objects
  for select to authenticated using (
    bucket_id = 'ticket-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.autonomous_task_runs r
       where r.id::text = (storage.foldername(name))[2]
         and r.user_id = auth.uid()
    )
  );
-- No update or delete policy: evidence images can't be replaced or removed by users.
