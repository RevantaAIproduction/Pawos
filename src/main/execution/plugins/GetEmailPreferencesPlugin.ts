import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { emailPreferencesStore } from '../../communication/EmailPreferencesStore';

export class GetEmailPreferencesPlugin extends BasePlugin {
  id = 'getEmailPreferences';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getEmailPreferences';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: { preferences: emailPreferencesStore.get() } };
  }

  describeInProgress(): string {
    return 'Checking your email preferences…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getEmailPreferences') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const preferences = (result.data as { preferences?: { emailAddress: string } | null } | undefined)?.preferences;
    return preferences ? `Your email preferences are set to ${preferences.emailAddress}.` : "You haven't set email preferences yet — I'll use your OS default mail handler until you do.";
  }
}

export const getEmailPreferencesPlugin = new GetEmailPreferencesPlugin();
