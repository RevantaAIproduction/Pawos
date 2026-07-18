import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { copyWithVerify } from './pathCopy';
import { onFileMoved, onFileRenamed } from '../../memory/entities/fileEntities';

/** Covers both rename and move — fs.rename handles both identically. Destructive at the type level (DESTRUCTIVE_ACTION_TYPES) since a wrong move can silently break references. */
export class MovePathPlugin extends BasePlugin {
  id = 'movePath';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'movePath';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'movePath') return [];
    if (!fs.existsSync(request.from)) {
      return [{ id: 'source-missing', message: `I can't find "${request.from}" — which file or folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'movePath') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      await fs.promises.mkdir(path.dirname(request.to), { recursive: true });
      try {
        await fs.promises.rename(request.from, request.to);
      } catch (error) {
        // Cross-volume moves (e.g. C: -> a USB drive, or between two
        // different network shares) can't be renamed in place — fall back
        // to copy-verify-then-delete-source via the same shared helper
        // CopyPathPlugin/DuplicatePathPlugin/MergeFoldersPlugin use.
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        await copyWithVerify(request.from, request.to);
        await fs.promises.rm(request.from, { recursive: true, force: true });
      }
      if (path.dirname(request.from) === path.dirname(request.to)) onFileRenamed(request.from, request.to);
      else onFileMoved(request.from, request.to);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'movePath' || !result.ok) return result;
    if (!fs.existsSync(request.to)) {
      return { ok: false, reason: 'failed', message: "The move reported success, but the destination doesn't exist — something went wrong." };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'movePath') return 'Working on that…';
    return `Moving ${path.basename(request.from)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'movePath') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `I've moved ${path.basename(request.from)} to ${request.to}.`;
  }
}

export const movePathPlugin = new MovePathPlugin();
