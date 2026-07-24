import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { onFileCreated, onFileModified } from '../../memory/entities/fileEntities';
import { recoverByRetry } from '../RecoverByRetry';

/**
 * Writing a brand-new file is low-risk; overwriting one that already exists
 * isn't — so confirmation here is a genuine per-request check (does this
 * exact path already have something in it right now), not a blanket
 * type-level gate like createFolder/runCommand.
 */
export class WriteFilePlugin extends BasePlugin {
  id = 'writeFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'writeFile';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'writeFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.path);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      await fs.promises.mkdir(path.dirname(request.path), { recursive: true });
      await fs.promises.writeFile(request.path, request.content, 'utf-8');
      if (exists) onFileModified(request.path);
      else onFileCreated(request.path);
      return { ok: true, data: { overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'writeFile' || !result.ok) return result;
    try {
      const written = await fs.promises.readFile(request.path, 'utf-8');
      if (written !== request.content) {
        return { ok: false, reason: 'failed', message: 'The file was written but its content doesn’t match what I sent — something went wrong.' };
      }
      return result;
    } catch (error) {
      return { ok: false, reason: 'failed', message: `I wrote the file but couldn't confirm it afterward: ${(error as Error).message}` };
    }
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    return recoverByRetry(request, result, (r) => this.execute(r));
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'writeFile') return 'Working on that…';
    return `${fs.existsSync(request.path) ? 'Updating' : 'Creating'} ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'writeFile') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `${path.basename(request.path)} already exists. Should I overwrite it?`;
      }
      return describeFailure(result);
    }
    const data = result.data as { overwritten?: boolean } | undefined;
    return data?.overwritten
      ? `I've updated ${path.basename(request.path)}.`
      : `I've created ${path.basename(request.path)}.`;
  }
}

export const writeFilePlugin = new WriteFilePlugin();
