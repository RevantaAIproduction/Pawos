import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

/** Real DOM.setFileInputFiles via CDP (page JS has no way to set an <input type="file">'s files) — verified by reading the input's own .files list back, not just trusting the CDP call didn't throw. */
export class UploadBrowserFilePlugin extends BasePlugin {
  id = 'uploadBrowserFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'uploadBrowserFile';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'uploadBrowserFile') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    if (!fs.existsSync(request.filePath)) {
      return [{ id: 'file-missing', message: `I can't find "${request.filePath}" — which file did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'uploadBrowserFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.setFileInput(request.sessionId, request.selector, request.filePath);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { selector: request.selector, filePath: request.filePath } };
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'uploadBrowserFile' || !result.ok) return result;
    const expectedName = path.basename(request.filePath);
    const check = await browserRuntime.evaluate(
      request.sessionId,
      `(function() { const el = document.querySelector(${JSON.stringify(request.selector)}); return el && el.files && el.files.length > 0 ? el.files[0].name : null; })()`
    );
    if (!check.ok || check.value !== expectedName) {
      return { ok: false, reason: 'failed', message: `The file input doesn't show "${expectedName}" attached.`, data: result.data };
    }
    return result;
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'uploadBrowserFile' || result.ok) return result;
    return this.execute(request);
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'uploadBrowserFile') return 'Working on that…';
    return `Attaching ${request.filePath}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'uploadBrowserFile') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've attached the file, and confirmed it's there." : describeFailure(result);
  }
}

export const uploadBrowserFilePlugin = new UploadBrowserFilePlugin();
