import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

const clickScript = (selector: string) => `
  (function() {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return JSON.stringify({ found: false });
    el.click();
    return JSON.stringify({ found: true, tag: el.tagName });
  })()
`;

/**
 * Real DOM click via the page's own querySelector/click — never assumed to
 * have worked just because the call didn't throw. The minimum honest check
 * is "the element existed and .click() was actually invoked on it"; whether
 * the click's INTENDED effect happened (navigation, a modal appearing, a
 * value changing) is what waitForBrowserState is for, called as a separate,
 * explicit follow-up step — this plugin doesn't guess at page-specific intent.
 */
export class ClickElementPlugin extends BasePlugin {
  id = 'clickElement';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'clickElement';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'clickElement') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'clickElement') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const urlBefore = browserRuntime.getCurrentUrl(request.sessionId);
    const result = await browserRuntime.evaluate(request.sessionId, clickScript(request.selector));
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    let parsed: { found: boolean; tag?: string };
    try {
      parsed = JSON.parse(result.value as string);
    } catch {
      return { ok: false, reason: 'failed', message: 'Could not read the click result.' };
    }
    if (!parsed.found) {
      return { ok: false, reason: 'failed', message: `Could not find an element matching "${request.selector}".` };
    }

    // A brief settle window for any immediate reaction (navigation, a thrown error) before verify() looks.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const urlAfter = browserRuntime.getCurrentUrl(request.sessionId);
    return { ok: true, data: { selector: request.selector, urlBefore, urlAfter, navigated: urlBefore !== urlAfter } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'clickElement' || result.ok) return result;
    // The element may not have rendered yet — wait briefly and retry once, a real remediation, not a blind repeat.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return this.execute(request);
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'clickElement') return 'Working on that…';
    return `Clicking "${request.selector}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'clickElement') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { navigated?: boolean } | undefined;
    return data?.navigated ? "I've clicked it — the page navigated." : "I've clicked it.";
  }
}

export const clickElementPlugin = new ClickElementPlugin();
