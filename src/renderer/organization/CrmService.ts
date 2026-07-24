import { getSupabaseClient } from '../auth/supabaseClient';
import type { OrgCompany, OrgContact, OrgMeetingSummary, OrgFollowUp, RelationshipHistoryEntry } from '../../shared/organization/CrmTypes';

type CompanyRow = { id: string; organization_id: string; name: string; domain: string | null; created_by: string | null; created_at: string; updated_at: string };
type ContactRow = {
  id: string;
  organization_id: string;
  name: string;
  role: string | null;
  emails: string[];
  company_id: string | null;
  source_participant_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type SummaryRow = {
  id: string;
  organization_id: string;
  company_id: string | null;
  headline: string;
  summary: string;
  key_points: string[];
  occurred_at: string;
  source_communication_ref: string | null;
  shared_by: string | null;
  created_at: string;
};
type FollowUpRow = {
  id: string;
  organization_id: string;
  meeting_summary_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  description: string;
  suggested_when: string | null;
  status: OrgFollowUp['status'];
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toCompany(row: CompanyRow): OrgCompany {
  return { id: row.id, organizationId: row.organization_id, name: row.name, domain: row.domain, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toContact(row: ContactRow): OrgContact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    role: row.role,
    emails: row.emails ?? [],
    companyId: row.company_id,
    sourceParticipantRef: row.source_participant_ref,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: SummaryRow): OrgMeetingSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    headline: row.headline,
    summary: row.summary,
    keyPoints: row.key_points ?? [],
    occurredAt: row.occurred_at,
    sourceCommunicationRef: row.source_communication_ref,
    sharedBy: row.shared_by,
    createdAt: row.created_at,
  };
}

function toFollowUp(row: FollowUpRow): OrgFollowUp {
  return {
    id: row.id,
    organizationId: row.organization_id,
    meetingSummaryId: row.meeting_summary_id,
    contactId: row.contact_id,
    companyId: row.company_id,
    description: row.description,
    suggestedWhen: row.suggested_when,
    status: row.status,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Phase 1 — organization-shared CRM. Direct-Supabase pattern. Any active
 * org member can share their own contact/company/summary/follow-up
 * (RLS requires created_by/shared_by = self on insert); the creator or a
 * crm.manage capability holder can edit/delete. This is a deliberate,
 * opt-in projection of local Communication Runtime data — see
 * OrgSyncBridge in the renderer communication module for the "share this"
 * entry points; nothing here reads local storage automatically.
 */
export const crmService = {
  async listCompanies(organizationId: string): Promise<OrgCompany[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('org_companies').select('*').eq('organization_id', organizationId).order('name').returns<CompanyRow[]>();
    if (error) throw error;
    return (data ?? []).map(toCompany);
  },

  async shareCompany(organizationId: string, name: string, domain?: string): Promise<OrgCompany> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('org_companies')
      .insert({ organization_id: organizationId, name, domain: domain ?? null, created_by: userData.user?.id ?? null })
      .select('*')
      .single<CompanyRow>();
    if (error) throw error;
    return toCompany(data);
  },

  async listContacts(organizationId: string): Promise<OrgContact[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('org_contacts').select('*').eq('organization_id', organizationId).order('name').returns<ContactRow[]>();
    if (error) throw error;
    return (data ?? []).map(toContact);
  },

  async shareContact(
    organizationId: string,
    input: { name: string; role?: string; emails?: string[]; companyId?: string; sourceParticipantRef?: string }
  ): Promise<OrgContact> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('org_contacts')
      .insert({
        organization_id: organizationId,
        name: input.name,
        role: input.role ?? null,
        emails: input.emails ?? [],
        company_id: input.companyId ?? null,
        source_participant_ref: input.sourceParticipantRef ?? null,
        created_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<ContactRow>();
    if (error) throw error;
    return toContact(data);
  },

  async listMeetingSummaries(organizationId: string): Promise<OrgMeetingSummary[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('org_meeting_summaries')
      .select('*')
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .returns<SummaryRow[]>();
    if (error) throw error;
    return (data ?? []).map(toSummary);
  },

  async shareMeetingSummary(
    organizationId: string,
    input: { headline: string; summary: string; keyPoints?: string[]; companyId?: string; occurredAt?: string; sourceCommunicationRef?: string }
  ): Promise<OrgMeetingSummary> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('org_meeting_summaries')
      .insert({
        organization_id: organizationId,
        headline: input.headline,
        summary: input.summary,
        key_points: input.keyPoints ?? [],
        company_id: input.companyId ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        source_communication_ref: input.sourceCommunicationRef ?? null,
        shared_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<SummaryRow>();
    if (error) throw error;
    return toSummary(data);
  },

  async listFollowUps(organizationId: string): Promise<OrgFollowUp[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('org_follow_ups')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .returns<FollowUpRow[]>();
    if (error) throw error;
    return (data ?? []).map(toFollowUp);
  },

  async createFollowUp(
    organizationId: string,
    input: { description: string; contactId?: string; companyId?: string; meetingSummaryId?: string; suggestedWhen?: string; assignedTo?: string }
  ): Promise<OrgFollowUp> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('org_follow_ups')
      .insert({
        organization_id: organizationId,
        description: input.description,
        contact_id: input.contactId ?? null,
        company_id: input.companyId ?? null,
        meeting_summary_id: input.meetingSummaryId ?? null,
        suggested_when: input.suggestedWhen ?? null,
        assigned_to: input.assignedTo ?? null,
        created_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<FollowUpRow>();
    if (error) throw error;
    return toFollowUp(data);
  },

  async setFollowUpStatus(followUpId: string, status: OrgFollowUp['status']): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('org_follow_ups').update({ status, updated_at: new Date().toISOString() }).eq('id', followUpId);
    if (error) throw error;
  },

  /** Relationship history for one contact or company — a read-side merge
   * of shared meeting summaries and follow-ups, not a separate table. */
  async getRelationshipHistory(organizationId: string, filter: { contactId?: string; companyId?: string }): Promise<RelationshipHistoryEntry[]> {
    const supabase = await getSupabaseClient();
    let summaryQuery = supabase.from('org_meeting_summaries').select('*').eq('organization_id', organizationId);
    if (filter.companyId) summaryQuery = summaryQuery.eq('company_id', filter.companyId);
    const { data: summaries, error: summaryError } = await summaryQuery.returns<SummaryRow[]>();
    if (summaryError) throw summaryError;

    let followUpQuery = supabase.from('org_follow_ups').select('*').eq('organization_id', organizationId);
    if (filter.contactId) followUpQuery = followUpQuery.eq('contact_id', filter.contactId);
    if (filter.companyId) followUpQuery = followUpQuery.eq('company_id', filter.companyId);
    const { data: followUps, error: followUpError } = await followUpQuery.returns<FollowUpRow[]>();
    if (followUpError) throw followUpError;

    const entries: RelationshipHistoryEntry[] = [
      ...(summaries ?? []).map((row): RelationshipHistoryEntry => ({ kind: 'meetingSummary', occurredAt: row.occurred_at, entry: toSummary(row) })),
      ...(followUps ?? []).map((row): RelationshipHistoryEntry => ({ kind: 'followUp', occurredAt: row.created_at, entry: toFollowUp(row) })),
    ];
    return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  },
};
