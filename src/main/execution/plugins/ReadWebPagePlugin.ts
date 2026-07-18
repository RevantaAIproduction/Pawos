import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

const DEFAULT_MAX_CHARS = 8000;

const READ_TEXT_JS = `document.body ? document.body.innerText : ''`;

/** Real visible text extraction (document.body.innerText) — not a guess, not a fabricated summary. Summarizing what comes back is the model's own job, not this plugin's. */
export class ReadWebPagePlugin extends BasePlugin {
  id = 'readWebPage';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'readWebPage';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'readWebPage') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'readWebPage') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.evaluate(request.sessionId, READ_TEXT_JS);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    const maxChars = request.maxChars ?? DEFAULT_MAX_CHARS;
    const text = typeof result.value === 'string' ? result.value.trim() : '';
    return { ok: true, data: { url: browserRuntime.getCurrentUrl(request.sessionId), text: text.slice(0, maxChars), truncated: text.length > maxChars } };
  }

  /** Never report success on an empty page — a blank body usually means the page hasn't finished loading or the selector context is wrong. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'readWebPage' || !result.ok) return result;
    const data = result.data as { text?: string } | undefined;
    if (!data?.text) return { ok: false, reason: 'failed', message: 'The page appears to be empty — it may still be loading.' };
    return result;
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'readWebPage' || result.ok) return result;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return this.execute(request);
  }

  describeInProgress(): string {
    return 'Reading the page…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'readWebPage') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { text?: string } | undefined;
    return `Read ${data?.text?.length ?? 0} characters from the page.`;
  }
}

export const readWebPagePlugin = new ReadWebPagePlugin();
