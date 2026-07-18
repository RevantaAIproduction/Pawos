import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { devBrowserManager } from '../DevBrowserManager';

export class UploadProjectFilePlugin extends BasePlugin {
  id = 'uploadProjectFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'uploadProjectFile';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'uploadProjectFile') return [];
    if (!devBrowserManager.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    if (!fs.existsSync(request.filePath)) {
      return [{ id: 'file-missing', message: `I can't find "${request.filePath}" — which file did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'uploadProjectFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await devBrowserManager.setFileInput(request.sessionId, request.selector, request.filePath);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'uploadProjectFile') return 'Working on that…';
    return `Attaching ${request.filePath}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'uploadProjectFile') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've attached the file." : describeFailure(result);
  }
}

export const uploadProjectFilePlugin = new UploadProjectFilePlugin();
