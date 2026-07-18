import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { recordVisitedPage } from '../../memory/entities/webEntities';

/**
 * "Reuse my existing login for GitHub" — drives the user's REAL browser
 * profile (Chrome/Edge/Brave only) instead of Paw's isolated automation
 * one, so whatever they're already logged into just works. Paw never
 * touches a password or cookie value to make this happen — it simply
 * launches their own browser against their own profile. Always requires
 * confirmation: meaningfully more sensitive than ordinary browsing, since
 * it exposes real logged-in sessions.
 */
export class ReuseExistingBrowserSessionPlugin extends BasePlugin {
  id = 'reuseExistingBrowserSession';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'reuseExistingBrowserSession';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'reuseExistingBrowserSession') return [];
    try {
      new URL(request.url);
    } catch {
      return [{ id: 'url-invalid', message: `"${request.url}" doesn't look like a valid URL.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'reuseExistingBrowserSession') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.reuseSession(request.sessionId, request.url, request.browser);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message, data: { adapterReason: result.reason } };
    recordVisitedPage(request.url, undefined, request.browser);
    return { ok: true, data: { sessionId: request.sessionId, url: request.url, browser: request.browser } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'reuseExistingBrowserSession') return 'Working on that…';
    return `Opening ${request.url} in your real ${request.browser}, using your existing session… this can take a little while if your browser has a lot to load.`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'reuseExistingBrowserSession') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `To reuse your existing login, I'd need to open your real ${request.browser} browser (not my own sandboxed one) at ${request.url}. This uses whatever you're already logged into there. Should I go ahead?`;
      }
      // The adapter's own message already fully explains what happened and
      // lays out the real choices (isolated profile / close and retry /
      // Paw's own browser) — prepending describeFailure()'s generic
      // "I couldn't finish that —" would bury that explanation instead of
      // surfacing it.
      const adapterReason = (result.data as { adapterReason?: string } | undefined)?.adapterReason;
      if (adapterReason === 'running-no-debug-port' && result.message) {
        return result.message;
      }
      return describeFailure(result);
    }
    return `I've opened ${request.url} in your real ${request.browser}, using your existing session.`;
  }
}

export const reuseExistingBrowserSessionPlugin = new ReuseExistingBrowserSessionPlugin();
