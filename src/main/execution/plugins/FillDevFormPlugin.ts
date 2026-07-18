import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { devBrowserManager } from '../DevBrowserManager';

/** Destructive at the type level (DESTRUCTIVE_ACTION_TYPES) — it can submit a form (e.g. a dev login), a real effect worth confirming. */
export class FillDevFormPlugin extends BasePlugin {
  id = 'fillDevForm';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'fillDevForm';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'fillDevForm') return [];
    if (!devBrowserManager.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'fillDevForm') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await devBrowserManager.fillForm(request.sessionId, request.fields, request.submitSelector);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Filling in the form…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'fillDevForm') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return 'This will fill in and submit a form. Should I go ahead?';
      return describeFailure(result);
    }
    return "I've filled in the form.";
  }
}

export const fillDevFormPlugin = new FillDevFormPlugin();
