import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { recordSentEmail } from '../../../memory/entities/officeEntities';

/**
 * General-purpose sibling to ConfirmEmailSentPlugin — records that a
 * browser-compose email (opened via the existing openMailComposeWindow)
 * was actually sent, once the user explicitly says so. Never tied to a
 * communication session; feeds Office Memory / Recent Documents-style
 * history instead.
 */
export class ConfirmGeneralEmailSentPlugin extends BasePlugin {
  id = 'confirmGeneralEmailSent';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'confirmGeneralEmailSent';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'confirmGeneralEmailSent') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    recordSentEmail({ recipient: request.recipient, subject: request.subject, sentAt: Date.now() });
    return { ok: true, data: { recipient: request.recipient, subject: request.subject } };
  }

  describeInProgress(): string {
    return 'Recording that email…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'confirmGeneralEmailSent') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `Recorded that you sent "${request.subject}" to ${request.recipient}.`;
  }
}

export const confirmGeneralEmailSentPlugin = new ConfirmGeneralEmailSentPlugin();
