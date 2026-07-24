/**
 * Phase 1 — organization-shared CRM. These are an explicit, opt-in
 * projection: a member "shares" a local Communication Runtime contact/
 * company/summary/follow-up into the organization; nothing here is an
 * automatic mirror of local contacts.db/companies.db/intelligence.db (see
 * the migration header in supabase/migrations/20260721000600_phase1_org_
 * shared_data.sql for the full reasoning). `sourceParticipantRef` is a
 * best-effort breadcrumb back to the local record it came from — not a
 * foreign key, since local ids aren't stable across devices.
 */

export type OrgCompany = {
  id: string;
  organizationId: string;
  name: string;
  domain: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgContact = {
  id: string;
  organizationId: string;
  name: string;
  role: string | null;
  emails: string[];
  companyId: string | null;
  sourceParticipantRef: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgMeetingSummary = {
  id: string;
  organizationId: string;
  companyId: string | null;
  headline: string;
  summary: string;
  keyPoints: string[];
  occurredAt: string;
  sourceCommunicationRef: string | null;
  sharedBy: string | null;
  createdAt: string;
};

export type OrgFollowUpStatus = 'open' | 'done' | 'dismissed';

export type OrgFollowUp = {
  id: string;
  organizationId: string;
  meetingSummaryId: string | null;
  contactId: string | null;
  companyId: string | null;
  description: string;
  suggestedWhen: string | null;
  status: OrgFollowUpStatus;
  assignedTo: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Relationship history is a read-side merge, not its own table — see the
 * migration header. Ordered by occurredAt (summaries) / createdAt
 * (follow-ups), most recent first. */
export type RelationshipHistoryEntry =
  | { kind: 'meetingSummary'; occurredAt: string; entry: OrgMeetingSummary }
  | { kind: 'followUp'; occurredAt: string; entry: OrgFollowUp };
