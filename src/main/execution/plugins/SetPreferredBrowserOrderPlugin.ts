import type { ActionRequest, ActionResult, BrowserId } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

const VALID_IDS: BrowserId[] = ['chrome', 'edge', 'brave', 'firefox', 'electron'];

/** "Prefer Edge over Chrome." — the fallback order BrowserRuntime.resolveAdapter() walks when a request doesn't name a specific browser. */
export class SetPreferredBrowserOrderPlugin extends BasePlugin {
  id = 'setPreferredBrowserOrder';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setPreferredBrowserOrder';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'setPreferredBrowserOrder') return [];
    if (!Array.isArray(request.order) || request.order.length === 0) {
      return [{ id: 'order-empty', message: 'Tell me which browsers to prefer, and in what order.' }];
    }
    const invalid = request.order.filter((id) => !VALID_IDS.includes(id));
    if (invalid.length > 0) {
      return [{ id: 'order-invalid', message: `I don't recognize: ${invalid.join(', ')}. Known browsers are ${VALID_IDS.join(', ')}.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setPreferredBrowserOrder') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    browserRuntime.setPreferredBrowserOrder(request.order);
    return { ok: true, data: { order: request.order } };
  }

  describeInProgress(): string {
    return 'Updating your preferred browser order…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type !== 'setPreferredBrowserOrder') return 'Done.';
    return `Got it — I'll prefer ${request.order.join(' > ')} from now on.`;
  }
}

export const setPreferredBrowserOrderPlugin = new SetPreferredBrowserOrderPlugin();
