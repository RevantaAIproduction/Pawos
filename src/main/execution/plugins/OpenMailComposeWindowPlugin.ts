import { shell } from 'electron';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { emailPreferencesStore } from '../../communication/EmailPreferencesStore';
import { buildMailComposeUrl } from '../../../shared/communication/MailComposeUrl';

/** Opens a prefilled compose window in the user's own real, already-logged-in browser (or OS default mail handler) — Paw never sends anything itself; the human clicks Send. */
export class OpenMailComposeWindowPlugin extends BasePlugin {
  id = 'openMailComposeWindow';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'openMailComposeWindow';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'openMailComposeWindow') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const provider = emailPreferencesStore.get()?.provider ?? 'default';
    const url = buildMailComposeUrl(provider, { to: request.recipient, subject: request.subject, body: request.body });
    await shell.openExternal(url);
    return { ok: true };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'openMailComposeWindow') return 'Working on that…';
    return `Opening a compose window to ${request.recipient}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type !== 'openMailComposeWindow') return 'Done.';
    return `I've opened a compose window to ${request.recipient} in your browser. Let me know once you've sent it.`;
  }
}

export const openMailComposeWindowPlugin = new OpenMailComposeWindowPlugin();
