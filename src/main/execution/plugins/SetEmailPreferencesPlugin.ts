import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { emailPreferencesStore } from '../../communication/EmailPreferencesStore';

/** Saves a plain preference — display name, email address, which provider's compose URL to build. Not a login, not a connected account; no credential is ever stored. */
export class SetEmailPreferencesPlugin extends BasePlugin {
  id = 'setEmailPreferences';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setEmailPreferences';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setEmailPreferences') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const preferences = emailPreferencesStore.save({ displayName: request.displayName, emailAddress: request.emailAddress, provider: request.provider });
    return { ok: true, data: { preferences } };
  }

  describeInProgress(): string {
    return 'Saving your email preferences…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setEmailPreferences') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return "I've saved your email preferences. I'll use them to open the right kind of compose window for follow-up emails.";
  }
}

export const setEmailPreferencesPlugin = new SetEmailPreferencesPlugin();
