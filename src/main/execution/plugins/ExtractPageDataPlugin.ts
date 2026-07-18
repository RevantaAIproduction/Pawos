import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

/** Given selectors, returns each matching element's text/href/value. With none, falls back to a generic default (links + headings) rather than guessing at page-specific structure. Exported for reuse by ComparisonWorkflowPlugin, which extracts from each candidate the same way a manual extract_page_data call would. */
export function extractionScript(selectors: string[] | undefined): string {
  return `
    (function() {
      function describe(el) {
        return {
          text: (el.innerText || el.textContent || '').trim().slice(0, 500),
          href: el.tagName === 'A' ? el.href : undefined,
          value: 'value' in el ? el.value : undefined,
        };
      }
      const selectors = ${JSON.stringify(selectors ?? null)};
      if (selectors && selectors.length > 0) {
        const bySelector = {};
        for (const sel of selectors) {
          bySelector[sel] = Array.from(document.querySelectorAll(sel)).slice(0, 50).map(describe);
        }
        return JSON.stringify(bySelector);
      }
      const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(describe);
      const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 30).map(describe);
      return JSON.stringify({ links, headings });
    })()
  `;
}

/** Structured extraction (links/headings, or given CSS selectors) — real querySelectorAll results, not a fabricated summary. */
export class ExtractPageDataPlugin extends BasePlugin {
  id = 'extractPageData';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'extractPageData';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'extractPageData') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'extractPageData') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.evaluate(request.sessionId, extractionScript(request.selectors));
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    let data: unknown;
    try {
      data = JSON.parse(result.value as string);
    } catch {
      return { ok: false, reason: 'failed', message: 'Could not parse the extracted page data.' };
    }
    return { ok: true, data: { url: browserRuntime.getCurrentUrl(request.sessionId), extracted: data } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'extractPageData' || result.ok) return result;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return this.execute(request);
  }

  describeInProgress(): string {
    return 'Extracting data from the page…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'extractPageData') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've extracted the page data." : describeFailure(result);
  }
}

export const extractPageDataPlugin = new ExtractPageDataPlugin();
