import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { compressPaths, listArchiveEntries } from './archiveUtils';

/** Zips one or more files/folders into a single .zip. Destructiveness is conditional (only when `to` already exists). */
export class CompressPathPlugin extends BasePlugin {
  id = 'compressPath';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'compressPath';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'compressPath') return [];
    const missing = request.paths.filter((p) => !fs.existsSync(p));
    if (missing.length > 0) {
      return [{ id: 'source-missing', message: `I can't find ${missing.join(', ')} — which files did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'compressPath') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.to);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      await compressPaths(request.paths, request.to);
      return { ok: true, data: { overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'compressPath' || !result.ok) return result;
    try {
      const entries = await listArchiveEntries(request.to);
      if (entries.length === 0) {
        return { ok: false, reason: 'failed', message: 'The archive was created but appears to be empty — something went wrong.' };
      }
      return result;
    } catch (error) {
      return { ok: false, reason: 'failed', message: `I created the archive but couldn't confirm it afterward: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'compressPath') return 'Working on that…';
    return `Compressing ${request.paths.length} item${request.paths.length === 1 ? '' : 's'}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'compressPath') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `${path.basename(request.to)} already exists. Should I overwrite it?`;
      }
      return describeFailure(result);
    }
    return `I've compressed ${request.paths.length} item${request.paths.length === 1 ? '' : 's'} into ${path.basename(request.to)}.`;
  }
}

export const compressPathPlugin = new CompressPathPlugin();
