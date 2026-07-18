import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

const searchUrl = (query: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

type WebSearchResult = { title: string; url: string; snippet: string };

const EXTRACT_RESULTS_JS = `
  (function() {
    const results = Array.from(document.querySelectorAll('.result')).slice(0, 10).map((el) => {
      const titleEl = el.querySelector('.result__a');
      const snippetEl = el.querySelector('.result__snippet');
      return {
        title: titleEl ? titleEl.textContent.trim() : '',
        url: titleEl ? titleEl.href : '',
        snippet: snippetEl ? snippetEl.textContent.trim() : '',
      };
    }).filter((r) => r.title && r.url);
    return JSON.stringify(results);
  })()
`;

/** Always navigates to one fixed, trusted search-engine origin — never destructive, distinct from browseWeb's general-web permission gate. */
export class SearchWebPlugin extends BasePlugin {
  id = 'searchWeb';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'searchWeb';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'searchWeb') return [];
    if (!request.query.trim()) return [{ id: 'query-empty', message: 'What would you like me to search for?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'searchWeb') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const nav = await browserRuntime.navigateUnrestricted(request.sessionId, searchUrl(request.query), request.browser);
    if (!nav.ok) return { ok: false, reason: 'failed', message: nav.message };
    return { ok: true, data: { sessionId: request.sessionId, query: request.query } };
  }

  /** Real extraction, not a guess — parses the search engine's own DOM for result titles/urls/snippets and fails honestly if nothing came back. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'searchWeb' || !result.ok) return result;
    const evalResult = await browserRuntime.evaluate(request.sessionId, EXTRACT_RESULTS_JS);
    if (!evalResult.ok) return { ok: false, reason: 'failed', message: evalResult.message };

    let results: WebSearchResult[] = [];
    try {
      results = JSON.parse(evalResult.value as string);
    } catch {
      // leave empty — reported as a real failure below, not silently swallowed
    }
    if (results.length === 0) {
      return { ok: false, reason: 'failed', message: `Searched for "${request.query}" but found no results on the page.` };
    }
    return { ok: true, data: { query: request.query, results } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'searchWeb' || result.ok) return result;
    const nav = await browserRuntime.navigateUnrestricted(request.sessionId, searchUrl(request.query), request.browser);
    if (!nav.ok) return { ok: false, reason: 'failed', message: nav.message };
    return { ok: true, data: { sessionId: request.sessionId, query: request.query } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'searchWeb') return 'Working on that…';
    return `Searching for "${request.query}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'searchWeb') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { results?: WebSearchResult[] } | undefined;
    const count = data?.results?.length ?? 0;
    return `Found ${count} result${count === 1 ? '' : 's'}.`;
  }
}

export const searchWebPlugin = new SearchWebPlugin();
