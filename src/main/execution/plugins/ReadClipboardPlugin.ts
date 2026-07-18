import { clipboard } from 'electron';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

const PREVIEW_LENGTH = 160;

export class ReadClipboardPlugin extends BasePlugin {
  id = 'readClipboard';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'readClipboard';
  }

  async execute(_request: ActionRequest): Promise<ActionResult> {
    const text = clipboard.readText();
    return { ok: true, data: text };
  }

  describeInProgress(_request: ActionRequest): string {
    return 'Checking your clipboard…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const text = typeof result.data === 'string' ? result.data.trim() : '';
    if (!text) return "Your clipboard is empty right now.";
    const preview = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
    return `Your clipboard has: "${preview}"`;
  }
}

export const readClipboardPlugin = new ReadClipboardPlugin();
