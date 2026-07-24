import { getIpcBridge } from '../services/ipc/ipcBridge';
import { crmService } from './CrmService';
import type { ParticipantRecord, CompanyRecord, CommunicationSummary, FollowUp } from '../../shared/communication/CommunicationTypes';
import type { OrgCompany, OrgContact, OrgMeetingSummary } from '../../shared/organization/CrmTypes';

/**
 * Phase 1's "Org Sync Agent" realized as a thin, explicit bridge rather
 * than a background daemon — there is no always-on sync process anywhere
 * in this app, and Communication Runtime storage (contacts.db/
 * companies.db/intelligence.db) is untouched by this file. A member reads
 * their own local data (via the read-only communication:listLocal* IPC
 * channels) and explicitly chooses to share one record into the org; nothing
 * here runs automatically or in the background. See the header comment in
 * supabase/migrations/20260721000600_phase1_org_shared_data.sql for the
 * full reasoning.
 */
export const orgSyncBridge = {
  async listShareableParticipants(): Promise<ParticipantRecord[]> {
    return getIpcBridge().communicationListLocalParticipants();
  },

  async listShareableCompanies(): Promise<CompanyRecord[]> {
    return getIpcBridge().communicationListLocalCompanies();
  },

  async listShareableSummaries(): Promise<CommunicationSummary[]> {
    return getIpcBridge().communicationListLocalSummaries();
  },

  async listShareableFollowUps(): Promise<FollowUp[]> {
    return getIpcBridge().communicationListLocalFollowUps();
  },

  async shareCompany(organizationId: string, company: CompanyRecord): Promise<OrgCompany> {
    return crmService.shareCompany(organizationId, company.name, company.domain ?? undefined);
  },

  async shareParticipant(organizationId: string, participant: ParticipantRecord, orgCompanyId?: string): Promise<OrgContact> {
    return crmService.shareContact(organizationId, {
      name: participant.name,
      role: participant.role ?? undefined,
      emails: participant.emails,
      companyId: orgCompanyId,
      sourceParticipantRef: participant.id,
    });
  },

  async shareMeetingSummary(organizationId: string, summary: CommunicationSummary, orgCompanyId?: string): Promise<OrgMeetingSummary> {
    return crmService.shareMeetingSummary(organizationId, {
      headline: summary.headline,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      companyId: orgCompanyId,
      occurredAt: new Date(summary.generatedAt).toISOString(),
      sourceCommunicationRef: summary.communicationId,
    });
  },

  async shareFollowUp(organizationId: string, followUp: FollowUp, contactId?: string, companyId?: string): Promise<void> {
    await crmService.createFollowUp(organizationId, {
      description: followUp.suggestedAction || followUp.reason,
      suggestedWhen: followUp.suggestedWhen ?? undefined,
      contactId,
      companyId,
    });
  },
};
