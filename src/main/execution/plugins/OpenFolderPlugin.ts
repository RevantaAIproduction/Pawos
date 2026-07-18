import { shell } from 'electron';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

export class OpenFolderPlugin extends BasePlugin {
  id = 'openFolder';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'openFolder';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'openFolder') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const error = await shell.openPath(request.path);
    return error ? { ok: false, reason: 'failed', message: error } : { ok: true };
  }

  describeInProgress(_request: ActionRequest): string {
    return 'Opening that folder…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    return "I've opened the folder.";
  }
}

export const openFolderPlugin = new OpenFolderPlugin();
