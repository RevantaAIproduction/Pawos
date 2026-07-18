import { clipboard } from 'electron';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

/** Plain clipboard copy — records nothing, sends nothing. Used for "Copy Email" so the user can paste a draft into any mail client, messaging app, or CRM. */
export class CopyTextToClipboardPlugin extends BasePlugin {
  id = 'copyTextToClipboard';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'copyTextToClipboard';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'copyTextToClipboard') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    clipboard.writeText(request.text);
    return { ok: true };
  }

  describeInProgress(): string {
    return 'Copying to clipboard…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    return "I've copied that to your clipboard.";
  }
}

export const copyTextToClipboardPlugin = new CopyTextToClipboardPlugin();
