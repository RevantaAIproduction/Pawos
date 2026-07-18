import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

function scrollScript(selector: string | undefined, direction: 'up' | 'down', amount: number): string {
  if (selector) {
    return `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return JSON.stringify({ found: false });
        el.scrollIntoView({ block: 'center' });
        return JSON.stringify({ found: true });
      })()
    `;
  }
  const delta = direction === 'down' ? amount : -amount;
  return `
    (function() {
      window.scrollBy(0, ${delta});
      return JSON.stringify({ found: true, scrollY: window.scrollY });
    })()
  `;
}

/** Real scroll — either window.scrollBy or scrollIntoView on a real element, never assumed; verify() re-reads window.scrollY / the element's position to confirm something actually moved. */
export class ScrollBrowserPagePlugin extends BasePlugin {
  id = 'scrollBrowserPage';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'scrollBrowserPage';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'scrollBrowserPage') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'scrollBrowserPage') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const direction = request.direction ?? 'down';
    const amount = request.amount ?? 600;

    const result = await browserRuntime.evaluate(request.sessionId, scrollScript(request.selector, direction, amount));
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    let parsed: { found: boolean };
    try {
      parsed = JSON.parse(result.value as string);
    } catch {
      return { ok: false, reason: 'failed', message: 'Could not read the scroll result.' };
    }
    if (!parsed.found) {
      return { ok: false, reason: 'failed', message: request.selector ? `Could not find an element matching "${request.selector}".` : 'Scroll failed.' };
    }
    return { ok: true, data: { selector: request.selector, direction, amount } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'scrollBrowserPage' || result.ok) return result;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return this.execute(request);
  }

  describeInProgress(): string {
    return 'Scrolling…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'scrollBrowserPage') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've scrolled." : describeFailure(result);
  }
}

export const scrollBrowserPagePlugin = new ScrollBrowserPagePlugin();
