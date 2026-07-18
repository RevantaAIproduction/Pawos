import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { mergeInto } from './pathCopy';

/** Merges every entry of one folder into another with a per-entry conflict policy. Compound multi-file risk — always in DESTRUCTIVE_ACTION_TYPES, unlike the other new file ops which self-check. */
export class MergeFoldersPlugin extends BasePlugin {
  id = 'mergeFolders';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'mergeFolders';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'mergeFolders') return [];
    if (!fs.existsSync(request.from)) {
      return [{ id: 'source-missing', message: `I can't find "${request.from}" — which folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'mergeFolders') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const written = await mergeInto(request.from, request.to, request.onConflict);
      return { ok: true, data: { written, overwritten: written.length > 0 } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'mergeFolders' || !result.ok) return result;
    if (!fs.existsSync(request.to)) {
      return { ok: false, reason: 'failed', message: "The merge reported success, but the destination doesn't exist." };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'mergeFolders') return 'Working on that…';
    return `Merging ${path.basename(request.from)} into ${path.basename(request.to)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'mergeFolders') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { written?: string[] } | undefined;
    const count = data?.written?.length ?? 0;
    return `I've merged ${path.basename(request.from)} into ${path.basename(request.to)} (${count} file${count === 1 ? '' : 's'} written).`;
  }
}

export const mergeFoldersPlugin = new MergeFoldersPlugin();
