import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

/** Real CDP cookie read for an open session. Always requires confirmation (DESTRUCTIVE_ACTION_TYPES) — cookies can carry session tokens, sensitive regardless of which profile is in use. */
export class GetBrowserCookiesPlugin extends BasePlugin {
  id = 'getBrowserCookies';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getBrowserCookies';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'getBrowserCookies') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getBrowserCookies') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.cookies(request.sessionId);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { cookies: result.cookies } };
  }

  describeInProgress(): string {
    return "Checking this session's cookies…";
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getBrowserCookies') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return "Reading cookies can expose session tokens — should I go ahead?";
      return describeFailure(result);
    }
    const data = result.data as { cookies?: unknown[] } | undefined;
    return `Found ${data?.cookies?.length ?? 0} cookies for this session.`;
  }
}

export const getBrowserCookiesPlugin = new GetBrowserCookiesPlugin();
