import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { EmailDraft, SentEmailRecord } from '../../../shared/communication/CommunicationTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationSessionStore } from '../../communication/CommunicationSessionStore';
import { communicationSearchIndexStore } from '../../communication/CommunicationSearchIndexStore';

function newSentEmailId(): string {
  return `sentemail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The ONLY place a recipient is ever marked "sent" — always in direct
 * response to the user explicitly confirming it (Sequential mode's
 * Yes/Not Yet prompt, or Batch mode's Mark All/Selected as Sent). Opening a
 * compose window is never itself evidence of delivery.
 */
export class ConfirmEmailSentPlugin extends BasePlugin {
  id = 'confirmEmailSent';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'confirmEmailSent';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'confirmEmailSent') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const draft = communicationSessionStore.readSessionJson<EmailDraft>(request.communicationId, 'email-draft.json');
    if (!draft || draft.id !== request.draftId) return { ok: false, reason: 'failed', message: "I couldn't find that draft." };

    const now = Date.now();
    const recipientStatus = { ...(draft.recipientStatus ?? {}) };
    for (const recipient of request.recipients) {
      recipientStatus[recipient] = { status: 'sent', sentAt: now };
    }
    const updatedDraft: EmailDraft = { ...draft, recipientStatus };
    communicationSessionStore.writeSessionJson(request.communicationId, 'email-draft.json', updatedDraft);

    const record: SentEmailRecord = {
      id: newSentEmailId(),
      communicationId: request.communicationId,
      subject: draft.subject,
      body: draft.body,
      recipients: request.recipients,
      attachmentPaths: draft.attachmentPaths,
      sentAt: now,
      deliveryMethod: 'browserComposeConfirmed',
    };
    const existing = communicationSessionStore.readSessionJson<SentEmailRecord[]>(request.communicationId, 'emails.json') ?? [];
    communicationSessionStore.writeSessionJson(request.communicationId, 'emails.json', [...existing, record]);
    communicationSearchIndexStore.indexSession(request.communicationId);

    return { ok: true, data: { draft: updatedDraft } };
  }

  describeInProgress(): string {
    return 'Recording that follow-up as sent…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'confirmEmailSent') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `Got it — I've recorded that as sent to ${request.recipients.join(', ')}.`;
  }
}

export const confirmEmailSentPlugin = new ConfirmEmailSentPlugin();
