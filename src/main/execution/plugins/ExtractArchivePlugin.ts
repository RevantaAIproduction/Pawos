import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { extractArchive, listArchiveEntries } from './archiveUtils';

/** Extracts a .zip archive into a folder. Destructiveness is conditional (only when `to` already exists). To remove the archive afterward, the model issues a separate deletePath call — no deleteArchiveAfter flag here. */
export class ExtractArchivePlugin extends BasePlugin {
  id = 'extractArchive';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'extractArchive';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'extractArchive') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'archive-missing', message: `I can't find "${request.path}" — which archive did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'extractArchive') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.to);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const expectedEntries = await listArchiveEntries(request.path);
      await extractArchive(request.path, request.to);
      return { ok: true, data: { overwritten: exists, expectedEntries } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'extractArchive' || !result.ok) return result;
    if (!fs.existsSync(request.to)) {
      return { ok: false, reason: 'failed', message: "The extraction reported success, but the destination doesn't exist." };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'extractArchive') return 'Working on that…';
    return `Extracting ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'extractArchive') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `${path.basename(request.to)} already exists. Should I overwrite it?`;
      }
      return describeFailure(result);
    }
    return `I've extracted ${path.basename(request.path)} to ${request.to}.`;
  }
}

export const extractArchivePlugin = new ExtractArchivePlugin();
