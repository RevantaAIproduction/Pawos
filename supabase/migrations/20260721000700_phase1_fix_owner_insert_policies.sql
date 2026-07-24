-- PawOS Team & Enterprise Collaboration Platform — Phase 1 fix.
-- Apply after 20260721000600_phase1_org_shared_data.sql.
--
-- Bug found during live verification: the org owner has no row in
-- organization_members (they never go through the invite/accept flow), so
-- is_org_member() correctly returns false for them. Every SELECT policy in
-- the Phase 1 migration already accounts for this with an
-- "is_org_member(...) or organization_id in (select id from organizations
-- where owner_user_id = auth.uid())" check — but the INSERT policies on
-- workspace_projects, workspace_documents, workspace_research_sessions,
-- org_companies, org_contacts, org_meeting_summaries, org_follow_ups, and
-- organization_credit_usage_events only checked is_org_member(), so the
-- owner (a real, common case — every org has exactly one) could not create
-- their own shared project/document/research session/CRM record, hitting
-- "new row violates row-level security policy". This migration re-creates
-- those 8 insert policies with the same owner fallback the select policies
-- already use, and nothing else changes.

drop policy if exists workspace_projects_insert_own_org on workspace_projects;
create policy workspace_projects_insert_own_org on workspace_projects
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

drop policy if exists workspace_documents_insert_own_org on workspace_documents;
create policy workspace_documents_insert_own_org on workspace_documents
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

drop policy if exists workspace_research_insert_own_org on workspace_research_sessions;
create policy workspace_research_insert_own_org on workspace_research_sessions
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

drop policy if exists org_companies_insert_own_org on org_companies;
create policy org_companies_insert_own_org on org_companies
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

drop policy if exists org_contacts_insert_own_org on org_contacts;
create policy org_contacts_insert_own_org on org_contacts
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

drop policy if exists org_meeting_summaries_insert_own_org on org_meeting_summaries;
create policy org_meeting_summaries_insert_own_org on org_meeting_summaries
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and shared_by = auth.uid()
  );

drop policy if exists org_follow_ups_insert_own_org on org_follow_ups;
create policy org_follow_ups_insert_own_org on org_follow_ups
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

drop policy if exists organization_credit_usage_events_insert on organization_credit_usage_events;
create policy organization_credit_usage_events_insert on organization_credit_usage_events
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and user_id = auth.uid()
  );
