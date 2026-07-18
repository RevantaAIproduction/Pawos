import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { trashStore } from './recycleBin';
import { onFileRestored } from '../../memory/entities/fileEntities';

/** Restores a file or folder previously deleted through deletePath's default trash routing (not available for permanent:true deletes). */
export class RestorePathPlugin extends BasePlugin {
  id = 'restorePath';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'restorePath';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'restorePath') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const restored = await trashStore.restore(request.path);
      if (!restored) {
        return { ok: false, reason: 'failed', message: `I couldn't find a trashed copy of "${request.path}" to restore.` };
      }
      onFileRestored(restored);
      return { ok: true, data: { path: restored } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'restorePath' || !result.ok) return result;
    if (!fs.existsSync(request.path)) {
      return { ok: false, reason: 'failed', message: 'The restore reported success, but the path doesn’t exist — something went wrong.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'restorePath') return 'Working on that…';
    return `Restoring ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'restorePath') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `I've restored ${path.basename(request.path)}.`;
  }
}

export const restorePathPlugin = new RestorePathPlugin();
