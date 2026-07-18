import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { devBrowserManager } from '../DevBrowserManager';

/**
 * "Browser Preview" + "Browser Console" for the Coding Canvas — a thin
 * wrapper over DevBrowserManager's own captureScreenshot()/getConsoleLog(),
 * which exist today but weren't wired to any plugin. Distinct from
 * captureBrowserScreenshot/readBrowserConsole, which read from the frozen
 * Browser Runtime's separate general-browsing session registry. Pro only —
 * gated via CODING_EXECUTION_ACTION_TYPES.
 */
export class DevBrowserPreviewPlugin extends BasePlugin {
  id = 'devBrowserPreview';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'devBrowserPreview';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'devBrowserPreview') return [];
    if (!devBrowserManager.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'devBrowserPreview') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!devBrowserManager.isOpen(request.sessionId)) {
      return { ok: false, reason: 'failed', message: "That Development Browser session isn't open." };
    }
    const screenshot = await devBrowserManager.captureScreenshot(request.sessionId);
    if (!screenshot.ok) return { ok: false, reason: 'failed', message: screenshot.message };
    const consoleEntries = devBrowserManager.getConsoleLog(request.sessionId) ?? [];
    return { ok: true, data: { base64Png: screenshot.base64Png, consoleEntries } };
  }

  describeInProgress(): string {
    return 'Checking the dev browser preview…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'devBrowserPreview') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { consoleEntries?: { level: string }[] } | undefined;
    const errorCount = data?.consoleEntries?.filter((e) => e.level === 'error').length ?? 0;
    return errorCount > 0
      ? `Here's the preview — ${errorCount} console error${errorCount === 1 ? '' : 's'} found.`
      : "Here's the preview — no console errors.";
  }
}

export const devBrowserPreviewPlugin = new DevBrowserPreviewPlugin();
