import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { EmailDraft } from '../../../shared/communication/CommunicationTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationSessionStore } from '../../communication/CommunicationSessionStore';

/** "Keep Private" — marks a draft so no further send action is offered. Never sends or deletes anything. */
export class SetEmailDraftPrivatePlugin extends BasePlugin {
  id = 'setEmailDraftPrivate';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setEmailDraftPrivate';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setEmailDraftPrivate') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const draft = communicationSessionStore.readSessionJson<EmailDraft>(request.communicationId, 'email-draft.json');
    if (!draft || draft.id !== request.draftId) return { ok: false, reason: 'failed', message: "I couldn't find that draft." };
    const updatedDraft: EmailDraft = { ...draft, keptPrivate: true };
    communicationSessionStore.writeSessionJson(request.communicationId, 'email-draft.json', updatedDraft);
    return { ok: true, data: { draft: updatedDraft } };
  }

  describeInProgress(): string {
    return 'Keeping that draft private…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    return "Okay, I'll keep that draft private — I won't offer to send it.";
  }
}

export const setEmailDraftPrivatePlugin = new SetEmailDraftPrivatePlugin();
