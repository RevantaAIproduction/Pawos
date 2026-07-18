import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function conditionsMet(sessionId: string, selector: string | undefined, urlContains: string | undefined): Promise<boolean> {
  if (urlContains) {
    const url = browserRuntime.getCurrentUrl(sessionId);
    if (!url || !url.includes(urlContains)) return false;
  }
  if (selector) {
    const result = await browserRuntime.evaluate(sessionId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (!result.ok || result.value !== true) return false;
  }
  return true;
}

/**
 * The real verification primitive for browsing flows — "did the thing I
 * expect (a selector appearing, a URL change) actually happen," polled from
 * the main process, not assumed. Every prior action's actual effect gets
 * confirmed here as an explicit, separate step rather than guessed at inline.
 */
export class WaitForBrowserStatePlugin extends BasePlugin {
  id = 'waitForBrowserState';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'waitForBrowserState';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'waitForBrowserState') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    if (!request.selector && !request.urlContains) {
      return [{ id: 'no-condition', message: 'What should I wait for — a selector to appear, a URL to change, or both?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'waitForBrowserState') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (await conditionsMet(request.sessionId, request.selector, request.urlContains)) {
        return { ok: true, data: { url: browserRuntime.getCurrentUrl(request.sessionId) } };
      }
      await sleep(POLL_INTERVAL_MS);
    }

    const parts = [request.selector && `selector "${request.selector}"`, request.urlContains && `URL containing "${request.urlContains}"`].filter(Boolean);
    return { ok: false, reason: 'failed', message: `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${parts.join(' and ')}.` };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'waitForBrowserState') return 'Working on that…';
    return request.selector ? `Waiting for "${request.selector}" to appear…` : `Waiting for the page to reach ${request.urlContains}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'waitForBrowserState') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "It's there." : describeFailure(result);
  }
}

export const waitForBrowserStatePlugin = new WaitForBrowserStatePlugin();
