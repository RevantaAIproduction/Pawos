import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { EmailDraft } from '../../../shared/communication/CommunicationTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';
import { communicationIntelligenceStore } from '../../communication/CommunicationIntelligenceStore';
import { communicationSessionStore } from '../../communication/CommunicationSessionStore';
import { communicationMemoryStore } from '../../communication/CommunicationMemoryStore';
import { draftFollowupEmail } from '../../communication/FollowupEmailDrafting';

function newDraftId(): string {
  return `emaildraft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Real draft generation, grounded entirely in the session's own real summary/action items/decisions — never sent automatically. Sending is always a separate, human-driven browser-compose step (openMailComposeWindow/confirmEmailSent), never gated on any pre-existing account/preference. */
export class DraftFollowupEmailPlugin extends BasePlugin {
  id = 'draftFollowupEmail';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'draftFollowupEmail';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'draftFollowupEmail') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.apiKey) return { ok: false, reason: 'failed', message: 'No AI provider key configured.' };

    const record = communicationRuntime.getCommunication(request.communicationId);
    if (!record) return { ok: false, reason: 'failed', message: 'Communication not found.' };
    const summary = communicationIntelligenceStore.getSummary(request.communicationId);
    if (!summary) return { ok: false, reason: 'failed', message: "That session hasn't been processed yet — process it first so there's real content to draft from." };

    const actionItems = communicationIntelligenceStore.getActionItems(request.communicationId).map((a) => ({ description: a.description, owner: a.owner }));
    const decisions = communicationIntelligenceStore.getDecisions(request.communicationId).map((d) => ({ description: d.description }));

    const draftResult = await draftFollowupEmail({
      apiKey: request.apiKey,
      title: record.title,
      headline: summary.headline,
      summary: summary.summary,
      actionItems,
      decisions,
    });

    const recipients = record.participants
      .map((pid) => communicationMemoryStore.getParticipant(pid))
      .flatMap((p) => p?.emails ?? []);

    const draft: EmailDraft = {
      id: newDraftId(),
      communicationId: request.communicationId,
      subject: draftResult.subject,
      body: draftResult.body,
      recipients,
      attachmentPaths: [],
      createdAt: Date.now(),
    };
    communicationSessionStore.writeSessionJson(request.communicationId, 'email-draft.json', draft);

    return { ok: true, data: { draft } };
  }

  describeInProgress(): string {
    return 'Drafting a follow-up email…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'draftFollowupEmail') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const draft = (result.data as { draft?: EmailDraft } | undefined)?.draft;
    if (!draft) return "Here's the draft.";
    return `Here's a draft: "${draft.subject}"${draft.recipients.length ? ` to ${draft.recipients.join(', ')}` : ' (no recipient email known yet — who should this go to?)'}. I can open a compose window in your browser whenever you're ready, or you can change anything first.`;
  }
}

export const draftFollowupEmailPlugin = new DraftFollowupEmailPlugin();
