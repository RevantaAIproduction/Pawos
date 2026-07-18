import type { CommunicationRecord, CompanyFileRef, CompanyWorkspace, TimelineScope, UnifiedTimelineEntry } from '../../shared/communication/CommunicationTypes';
import { communicationSessionStore } from './CommunicationSessionStore';
import { communicationMemoryStore } from './CommunicationMemoryStore';
import { communicationIntelligenceStore } from './CommunicationIntelligenceStore';

function headlineFor(record: CommunicationRecord): string {
  const summary = communicationIntelligenceStore.getSummary(record.id);
  return summary?.headline || record.title || `${record.medium} communication`;
}

function matchesScope(record: CommunicationRecord, scope?: TimelineScope): boolean {
  if (!scope) return true;
  if (scope.participantId && !record.participants.includes(scope.participantId)) return false;
  if (scope.companyId && !record.companies.includes(scope.companyId)) return false;
  if (scope.projectId && !record.projects.includes(scope.projectId)) return false;
  if (scope.medium && record.medium !== scope.medium) return false;
  if (scope.dateRange && (record.startedAt < scope.dateRange.from || record.startedAt > scope.dateRange.to)) return false;
  return true;
}

/**
 * Unified Communication Timeline (architecture doc §8) and Company
 * Workspace (§9) — both derived views, never separately stored data. A
 * single merge-sort over CommunicationRecord[] and FollowUp[], filtered by
 * whatever TimelineScope the caller asks for, so a call, an email, and a
 * message thread interleave correctly regardless of medium.
 */
class CommunicationTimelineStore {
  getTimeline(scope?: TimelineScope): UnifiedTimelineEntry[] {
    const communicationEntries: UnifiedTimelineEntry[] = communicationSessionStore
      .list()
      .filter((r) => matchesScope(r, scope))
      .map((r) => ({
        kind: 'communication' as const,
        id: r.id,
        occurredAt: r.startedAt,
        medium: r.medium,
        participants: r.participants,
        companyIds: r.companies,
        projectIds: r.projects,
        headline: headlineFor(r),
        relatedCommunicationId: null,
      }));

    const followUpEntries: UnifiedTimelineEntry[] = communicationIntelligenceStore
      .listFollowUps()
      .map((f): UnifiedTimelineEntry | null => {
        const parentRecord = communicationSessionStore.get(f.communicationId);
        if (!parentRecord || !matchesScope(parentRecord, scope)) return null;
        const occurredAt = f.suggestedWhen ? Date.parse(f.suggestedWhen) || Date.now() : Date.now();
        return {
          kind: 'followUp' as const,
          id: f.id,
          occurredAt,
          medium: 'followUp',
          participants: parentRecord.participants,
          companyIds: parentRecord.companies,
          projectIds: parentRecord.projects,
          headline: f.suggestedAction,
          relatedCommunicationId: f.communicationId,
        };
      })
      .filter((e): e is UnifiedTimelineEntry => e !== null);

    return [...communicationEntries, ...followUpEntries].sort((a, b) => b.occurredAt - a.occurredAt);
  }

  getCompanyWorkspace(companyId: string): CompanyWorkspace | null {
    const company = communicationMemoryStore.getCompany(companyId);
    if (!company) return null;

    const projects = company.projectIds.map((id) => communicationMemoryStore.getProject(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const participants = company.participantIds.map((id) => communicationMemoryStore.getParticipant(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const timeline = this.getTimeline({ companyId });

    const files: CompanyFileRef[] = [];
    for (const communicationId of company.communicationIds) {
      const record = communicationSessionStore.get(communicationId);
      if (!record) continue;
      for (const attachmentPath of record.attachmentPaths) {
        files.push({ path: attachmentPath, communicationId, addedAt: record.startedAt, originalFilename: attachmentPath.split(/[\\/]/).pop() ?? attachmentPath });
      }
    }

    const openActionItems = communicationIntelligenceStore.listOpenActionItemsForCommunications(company.communicationIds);

    return { company, projects, participants, timeline, files, openActionItems, openTaskIds: [] };
  }
}

export const communicationTimelineStore = new CommunicationTimelineStore();
