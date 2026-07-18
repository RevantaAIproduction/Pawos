import { shell } from 'electron';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

export class OpenFilePlugin extends BasePlugin {
  id = 'openFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'openFile';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'openFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    // shell.openPath opens a file with its OS-registered default app (or a
    // folder in the file explorer) — the OS itself reports a real error
    // string (e.g. "file not found") rather than this code guessing one.
    const error = await shell.openPath(request.path);
    return error ? { ok: false, reason: 'failed', message: error } : { ok: true };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'openFile') return 'Working on that…';
    return `Opening ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type !== 'openFile') return 'Done.';
    return `I've opened ${path.basename(request.path)}.`;
  }
}

export const openFilePlugin = new OpenFilePlugin();
