import { shell } from 'electron';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

export class OpenUrlPlugin extends BasePlugin {
  id = 'openUrl';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'openUrl';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'openUrl') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!/^https?:\/\//i.test(request.url)) {
      return { ok: false, reason: 'failed', message: 'Only http(s) URLs are allowed.' };
    }
    await shell.openExternal(request.url);
    return { ok: true };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'openUrl') return 'Working on that…';
    return `Opening ${request.url}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type !== 'openUrl') return 'Done.';
    return `I've opened ${request.url}.`;
  }
}

export const openUrlPlugin = new OpenUrlPlugin();
