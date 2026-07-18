import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

export class CreateFolderPlugin extends BasePlugin {
  id = 'createFolder';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'createFolder';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'createFolder') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      await fs.promises.mkdir(request.path, { recursive: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(_request: ActionRequest): string {
    return 'Creating a folder…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    return "I've created the folder.";
  }
}

export const createFolderPlugin = new CreateFolderPlugin();
