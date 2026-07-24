import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { trashStore } from './recycleBin';
import { onFileDeleted } from '../../memory/entities/fileEntities';
import { recoverByRetry } from '../RecoverByRetry';

/**
 * Deletes a file or folder (recursively). Always destructive —
 * DESTRUCTIVE_ACTION_TYPES always requires confirmation, no exceptions.
 * Routes through Paw's own trash staging by default (see recycleBin.ts —
 * a real Windows Recycle Bin restore needs fragile COM automation, so a
 * self-managed trash gives 100% reliable restorePath instead); `permanent:
 * true` does a real, unrecoverable delete.
 */
export class DeletePathPlugin extends BasePlugin {
  id = 'deletePath';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'deletePath';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'deletePath') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which file or folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'deletePath') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      if (request.permanent) {
        await fs.promises.rm(request.path, { recursive: true, force: true });
      } else {
        await trashStore.moveToTrash(request.path);
      }
      onFileDeleted(request.path);
      return { ok: true, data: { permanent: Boolean(request.permanent) } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'deletePath' || !result.ok) return result;
    if (fs.existsSync(request.path)) {
      return { ok: false, reason: 'failed', message: 'The delete reported success, but the path still exists.' };
    }
    return result;
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    return recoverByRetry(request, result, (r) => this.execute(r));
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'deletePath') return 'Working on that…';
    return `Deleting ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'deletePath') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return request.permanent
      ? `I've permanently deleted ${path.basename(request.path)}.`
      : `I've deleted ${path.basename(request.path)} — I can restore it if you change your mind.`;
  }
}

export const deletePathPlugin = new DeletePathPlugin();
