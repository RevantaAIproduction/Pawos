import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { recordVisitedPage } from '../../memory/entities/webEntities';

function isLocalOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
  } catch {
    return false;
  }
}

/**
 * The browser as a real worker — general web navigation, not localhost-
 * restricted like the Development Browser. Destructiveness is conditional
 * (writeFile's precedent): the FIRST navigation to a non-local origin for a
 * given session needs explicit confirmation; once approved, BrowserRuntime
 * remembers it so that session can keep browsing without asking again on
 * every single navigation. Routes through BrowserRuntime, which picks a
 * real installed browser (Chrome/Edge/Brave, falling back automatically)
 * or Paw's own embedded one — never hard-codes which.
 */
export class BrowseWebPlugin extends BasePlugin {
  id = 'browseWeb';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'browseWeb';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'browseWeb') return [];
    try {
      new URL(request.url);
    } catch {
      return [{ id: 'url-invalid', message: `"${request.url}" doesn't look like a valid URL.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'browseWeb') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const needsApproval = !isLocalOrigin(request.url) && !browserRuntime.isApprovedForGeneralBrowsing(request.sessionId);
    if (needsApproval && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }
    if (needsApproval) browserRuntime.approveGeneralBrowsing(request.sessionId);

    const result = await browserRuntime.navigateUnrestricted(request.sessionId, request.url, request.browser);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { sessionId: request.sessionId, url: request.url, browser: browserRuntime.browserFor(request.sessionId) } };
  }

  async *observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    if (request.type !== 'browseWeb' || !executeResult.ok) return;
    const currentUrl = browserRuntime.getCurrentUrl(request.sessionId);
    if (currentUrl) yield { at: Date.now(), message: `Loaded ${currentUrl}` };
  }

  /** Honest check: the browser's own reported URL, not just that navigation resolved without throwing. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'browseWeb' || !result.ok) return result;
    const currentUrl = browserRuntime.getCurrentUrl(request.sessionId);
    if (!currentUrl) return { ok: false, reason: 'failed', message: 'Navigated, but the browser session no longer reports a URL.' };
    recordVisitedPage(currentUrl, undefined, browserRuntime.browserFor(request.sessionId));
    return { ok: true, data: { sessionId: request.sessionId, url: currentUrl, browser: browserRuntime.browserFor(request.sessionId) } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'browseWeb' || result.ok) return result;
    // A pending permission gate is not something to "recover" from — retrying would
    // silently bypass the very check that made this fail in the first place.
    if (!result.ok && result.reason === 'requires-confirmation') return result;
    const retry = await browserRuntime.navigateUnrestricted(request.sessionId, request.url, request.browser);
    if (!retry.ok) return { ok: false, reason: 'failed', message: retry.message };
    return { ok: true, data: { sessionId: request.sessionId, url: request.url } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'browseWeb') return 'Working on that…';
    return `Opening ${request.url}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'browseWeb') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `I'd like to browse the web to open ${request.url}. Should I go ahead?`;
      return describeFailure(result);
    }
    const data = result.data as { url?: string; browser?: string } | undefined;
    const url = data?.url ?? request.url;
    return data?.browser && data.browser !== 'electron' ? `I've opened ${url} in ${data.browser}.` : `I've opened ${url}.`;
  }
}

export const browseWebPlugin = new BrowseWebPlugin();
