import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { EmailDraft, CommunicationSummary, ActionItem, Decision, FollowUp, ParticipantRecord, SessionTimelineEntry } from '../../../shared/communication/CommunicationTypes';
import type { TranscriptSegment } from '../../communication/CommunicationTranscription';
import type { SessionCategory } from '../../../shared/communication/SessionCategory';
import { getSessionCategory } from '../../../shared/communication/SessionCategory';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationSessionStore } from '../../communication/CommunicationSessionStore';
import { communicationIntelligenceStore } from '../../communication/CommunicationIntelligenceStore';
import { communicationMemoryStore } from '../../communication/CommunicationMemoryStore';
import { communicationSourceRegistry } from '../../communication/CommunicationSourceRegistry';

export type EmailDraftListEntry = {
  communicationId: string;
  title: string;
  sessionCategory: SessionCategory;
  summary: CommunicationSummary;
  actionItems: ActionItem[];
  decisions: Decision[];
  followUps: FollowUp[];
  timeline: SessionTimelineEntry[];
  participants: ParticipantRecord[];
  transcriptSegments: TranscriptSegment[];
  attachmentPaths: string[];
  draft: EmailDraft | null;
};

/** Lists every processed session (real summary exists), not just ones that already have a follow-up draft — this backs the "Meeting Summaries" Dashboard section. */
export class ListEmailDraftsPlugin extends BasePlugin {
  id = 'listEmailDrafts';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listEmailDrafts';
  }

  async execute(): Promise<ActionResult> {
    const entries: EmailDraftListEntry[] = [];
    for (const record of communicationSessionStore.list()) {
      const summary = communicationIntelligenceStore.getSummary(record.id);
      if (!summary) continue;
      const draft = communicationSessionStore.readSessionJson<EmailDraft>(record.id, 'email-draft.json');
      const sessionCategory = getSessionCategory(communicationSourceRegistry.get(record.medium)?.requiresAdapter);
      const actionItems = communicationIntelligenceStore.getActionItems(record.id);
      const decisions = communicationIntelligenceStore.getDecisions(record.id);
      const followUps = communicationIntelligenceStore.listFollowUps().filter((f) => f.communicationId === record.id);
      const timeline = communicationSessionStore.readSessionJson<SessionTimelineEntry[]>(record.id, 'timeline.json') ?? [];
      const participants = record.participants
        .map((pid) => communicationMemoryStore.getParticipant(pid))
        .filter((p): p is ParticipantRecord => p !== undefined);
      const transcriptSegments = communicationSessionStore.readSessionJson<{ segments: TranscriptSegment[] }>(record.id, 'transcript.json')?.segments ?? [];
      entries.push({
        communicationId: record.id,
        title: record.title,
        sessionCategory,
        summary,
        actionItems,
        decisions,
        followUps,
        timeline,
        participants,
        transcriptSegments,
        attachmentPaths: record.attachmentPaths,
        draft,
      });
    }
    return { ok: true, data: { drafts: entries } };
  }

  describeInProgress(): string {
    return 'Checking your meeting summaries…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const drafts = (result.data as { drafts?: EmailDraftListEntry[] } | undefined)?.drafts ?? [];
    return drafts.length ? `You have ${drafts.length} meeting summar${drafts.length === 1 ? 'y' : 'ies'}.` : "You don't have any meeting summaries yet.";
  }
}

export const listEmailDraftsPlugin = new ListEmailDraftsPlugin();
