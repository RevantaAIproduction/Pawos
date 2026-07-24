import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { copyWithVerify } from './pathCopy';
import { onFileCreated, onFileModified } from '../../memory/entities/fileEntities';
import { recoverByRetry } from '../RecoverByRetry';

/** Copies a file or folder. Destructiveness is conditional (only when `to` already exists) — self-checks like WriteFilePlugin, not the global DESTRUCTIVE_ACTION_TYPES gate. */
export class CopyPathPlugin extends BasePlugin {
  id = 'copyPath';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'copyPath';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'copyPath') return [];
    if (!fs.existsSync(request.from)) {
      return [{ id: 'source-missing', message: `I can't find "${request.from}" — which file or folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'copyPath') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.to);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      await copyWithVerify(request.from, request.to);
      if (exists) onFileModified(request.to);
      else onFileCreated(request.to);
      return { ok: true, data: { overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'copyPath' || !result.ok) return result;
    if (!fs.existsSync(request.to)) {
      return { ok: false, reason: 'failed', message: "The copy reported success, but the destination doesn't exist — something went wrong." };
    }
    return result;
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    return recoverByRetry(request, result, (r) => this.execute(r));
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'copyPath') return 'Working on that…';
    return `Copying ${path.basename(request.from)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'copyPath') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `${path.basename(request.to)} already exists at that destination. Should I overwrite it?`;
      }
      return describeFailure(result);
    }
    return `I've copied ${path.basename(request.from)} to ${request.to}.`;
  }
}

export const copyPathPlugin = new CopyPathPlugin();
