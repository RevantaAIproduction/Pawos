import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

export class CaptureBrowserScreenshotPlugin extends BasePlugin {
  id = 'captureBrowserScreenshot';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'captureBrowserScreenshot';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'captureBrowserScreenshot') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'captureBrowserScreenshot') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.captureScreenshot(request.sessionId);
    return result.ok ? { ok: true, data: { base64Png: result.base64Png } } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Taking a screenshot…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'captureBrowserScreenshot') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "Here's a screenshot." : describeFailure(result);
  }
}

export const captureBrowserScreenshotPlugin = new CaptureBrowserScreenshotPlugin();
