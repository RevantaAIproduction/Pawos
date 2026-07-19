import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { onFileCreated, onFileModified } from '../../../memory/entities/fileEntities';
import { upsertDocument } from '../../../memory/entities/officeEntities';

/** Document Intelligence's "merge PDFs" — a real byte-level merge via pdf-lib, never a fabricated combined document. Same overwrite-confirmation discipline as writeFile. */
export class MergePdfsPlugin extends BasePlugin {
  id = 'mergePdfs';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'mergePdfs';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'mergePdfs') return [];
    if (request.inputPaths.length < 2) {
      return [{ id: 'not-enough-pdfs', message: 'I need at least 2 PDFs to merge.' }];
    }
    const missing = request.inputPaths.find((p) => !fs.existsSync(p));
    if (missing) {
      return [{ id: 'input-missing', message: `I can't find "${missing}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'mergePdfs') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.outputPath);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const merged = await PDFDocument.create();
      let totalPages = 0;
      for (const inputPath of request.inputPaths) {
        const bytes = await fs.promises.readFile(inputPath);
        const source = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) merged.addPage(page);
        totalPages += pages.length;
      }
      const outputBytes = await merged.save();
      await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
      await fs.promises.writeFile(request.outputPath, outputBytes);
      if (exists) onFileModified(request.outputPath);
      else onFileCreated(request.outputPath);
      upsertDocument({ path: request.outputPath, format: 'pdf', createdAt: Date.now() });
      return { ok: true, data: { outputPath: request.outputPath, sourceCount: request.inputPaths.length, totalPages, overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Couldn't merge these PDFs: ${(error as Error).message}` };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'mergePdfs' || !result.ok) return result;
    if (!fs.existsSync(request.outputPath)) {
      return { ok: false, reason: 'failed', message: 'The merge reported success but the output file is missing.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'mergePdfs') return 'Working on that…';
    return `Merging ${request.inputPaths.length} PDFs…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'mergePdfs') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `${path.basename(request.outputPath)} already exists. Should I overwrite it with the merged PDF?`;
      return describeFailure(result);
    }
    const data = result.data as { totalPages: number; sourceCount: number } | undefined;
    return `Merged ${data?.sourceCount} PDFs into ${path.basename(request.outputPath)} (${data?.totalPages} pages total).`;
  }
}

export const mergePdfsPlugin = new MergePdfsPlugin();
