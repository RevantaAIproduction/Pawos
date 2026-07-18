import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { onFileCreated, onFileModified } from '../../memory/entities/fileEntities';
import { recordDownload } from '../../memory/entities/webEntities';

/** "Save this webpage as PDF" / "Print this invoice." Destructiveness is conditional (overwrite), same precedent as writeFile. Registers the saved PDF with File Runtime, same as a real download. */
export class PrintBrowserPageToPdfPlugin extends BasePlugin {
  id = 'printBrowserPageToPdf';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'printBrowserPageToPdf';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'printBrowserPageToPdf') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'printBrowserPageToPdf') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const savePath = path.normalize(request.savePath);
    const exists = fs.existsSync(savePath);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    const result = await browserRuntime.print(request.sessionId, savePath);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    const fileEntity = exists ? onFileModified(savePath) : onFileCreated(savePath);
    if (fileEntity) recordDownload(fileEntity.id, browserRuntime.getCurrentUrl(request.sessionId) ?? undefined);

    return { ok: true, data: { savePath, overwritten: exists } };
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'printBrowserPageToPdf' || !result.ok) return result;
    const data = result.data as { savePath?: string } | undefined;
    if (!data?.savePath || !fs.existsSync(data.savePath) || fs.statSync(data.savePath).size === 0) {
      return { ok: false, reason: 'failed', message: 'The PDF reported saved, but the file is missing or empty.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'printBrowserPageToPdf') return 'Working on that…';
    return `Saving the page as ${path.basename(request.savePath)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'printBrowserPageToPdf') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `${path.basename(request.savePath)} already exists. Should I overwrite it?`;
      return describeFailure(result);
    }
    return `I've saved the page as ${path.basename(request.savePath)}.`;
  }
}

export const printBrowserPageToPdfPlugin = new PrintBrowserPageToPdfPlugin();
