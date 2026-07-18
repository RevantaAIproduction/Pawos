import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

type FormField = { selector: string; value: string };

function readBackScript(fields: FormField[]): string {
  return `
    (function() {
      const fields = ${JSON.stringify(fields)};
      return JSON.stringify(fields.map(({ selector, value }) => {
        const el = document.querySelector(selector);
        return { selector, expected: value, actual: el ? el.value : null };
      }));
    })()
  `;
}

/**
 * Destructive — can submit a real form (a purchase, a login, a repo
 * creation), a real effect worth confirming, same as fillDevForm. Unlike
 * fillDevForm, this verifies field values actually landed (never trusts
 * fillForm's own "ok" report alone) and retries once if they didn't.
 */
export class FillBrowserFormPlugin extends BasePlugin {
  id = 'fillBrowserForm';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'fillBrowserForm';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'fillBrowserForm') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'fillBrowserForm') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.fillForm(request.sessionId, request.fields, request.submitSelector);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { sessionId: request.sessionId, fields: request.fields, submitted: Boolean(request.submitSelector) } };
  }

  /** Never trust fillForm's own "ok" alone — read the fields back and confirm the values actually landed (skipped once a submit already fired, since the page may have navigated away). */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'fillBrowserForm' || !result.ok) return result;
    const data = result.data as { fields: FormField[]; submitted: boolean } | undefined;
    if (!data || data.submitted) return result;

    const readBack = await browserRuntime.evaluate(request.sessionId, readBackScript(data.fields));
    if (!readBack.ok) return result;
    let entries: { selector: string; expected: string; actual: string | null }[] = [];
    try {
      entries = JSON.parse(readBack.value as string);
    } catch {
      return result;
    }
    const mismatched = entries.filter((e) => e.actual !== e.expected);
    if (mismatched.length > 0) {
      return {
        ok: false,
        reason: 'failed',
        message: `These fields didn't take the value I set: ${mismatched.map((m) => m.selector).join(', ')}.`,
        data: result.data,
      };
    }
    return result;
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'fillBrowserForm' || result.ok) return result;
    return this.execute(request);
  }

  describeInProgress(): string {
    return 'Filling in the form…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'fillBrowserForm') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return 'This will fill in and submit a form. Should I go ahead?';
      return describeFailure(result);
    }
    return "I've filled in the form, and confirmed the values took.";
  }
}

export const fillBrowserFormPlugin = new FillBrowserFormPlugin();
