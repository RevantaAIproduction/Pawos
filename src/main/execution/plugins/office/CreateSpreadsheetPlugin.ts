import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { onFileCreated, onFileModified } from '../../../memory/entities/fileEntities';
import { upsertSpreadsheet } from '../../../memory/entities/officeEntities';

/**
 * Spreadsheet Intelligence's "build a spreadsheet" — a real .xlsx via the
 * xlsx (SheetJS) library, with real spreadsheet formulas set on real cells,
 * not a CSV renamed to .xlsx. Same overwrite-confirmation discipline as
 * writeFile. SheetJS's community edition has no chart-writing API — this
 * plugin never claims to add a chart; that limitation stays honest in
 * describeDone/the system prompt rather than silently doing nothing.
 */
export class CreateSpreadsheetPlugin extends BasePlugin {
  id = 'createSpreadsheet';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'createSpreadsheet';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'createSpreadsheet') return [];
    if (!request.sheets || request.sheets.length === 0) {
      return [{ id: 'no-sheets', message: 'What data should this spreadsheet contain?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'createSpreadsheet') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const exists = fs.existsSync(request.outputPath);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const workbook = XLSX.utils.book_new();
      for (const sheet of request.sheets) {
        const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
        for (const { cell, formula } of sheet.formulas ?? []) {
          worksheet[cell] = { t: 'n', f: formula };
        }
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
      }
      await fs.promises.mkdir(path.dirname(request.outputPath), { recursive: true });
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      await fs.promises.writeFile(request.outputPath, buffer);
      if (exists) onFileModified(request.outputPath);
      else onFileCreated(request.outputPath);
      upsertSpreadsheet({ path: request.outputPath, sheetCount: request.sheets.length, createdAt: Date.now() });
      return { ok: true, data: { outputPath: request.outputPath, sheetCount: request.sheets.length, overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Couldn't create this spreadsheet: ${(error as Error).message}` };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'createSpreadsheet' || !result.ok) return result;
    if (!fs.existsSync(request.outputPath)) {
      return { ok: false, reason: 'failed', message: 'Creating the spreadsheet reported success but the file is missing.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'createSpreadsheet') return 'Working on that…';
    return `Creating ${path.basename(request.outputPath)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'createSpreadsheet') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `${path.basename(request.outputPath)} already exists. Should I overwrite it?`;
      return describeFailure(result);
    }
    const data = result.data as { sheetCount: number } | undefined;
    return `Created ${path.basename(request.outputPath)} with ${data?.sheetCount} sheet(s).`;
  }
}

export const createSpreadsheetPlugin = new CreateSpreadsheetPlugin();
