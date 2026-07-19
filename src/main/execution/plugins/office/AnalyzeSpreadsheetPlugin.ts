import * as fs from 'fs';
import * as XLSX from 'xlsx';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';

export type ColumnStats = { column: string; count: number; sum: number; average: number; min: number; max: number };
export type SpreadsheetAnalysis = { sheetName: string; rowCount: number; columns: ColumnStats[] };

/**
 * Spreadsheet Intelligence's real analysis step — actual count/sum/average/
 * min/max per numeric column, computed directly from the real cell values.
 * Never a fabricated pivot table or chart (SheetJS's free tier can't write
 * those) — this is the honest, real substitute: exact aggregate numbers the
 * model can build a report or recommendation from. Read-only, never gated.
 */
export class AnalyzeSpreadsheetPlugin extends BasePlugin {
  id = 'analyzeSpreadsheet';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeSpreadsheet';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeSpreadsheet') return [];
    if (!fs.existsSync(request.filePath)) {
      return [{ id: 'file-missing', message: `I can't find "${request.filePath}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeSpreadsheet') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.filePath)) return { ok: false, reason: 'failed', message: `I can't find "${request.filePath}".` };

    try {
      const workbook = XLSX.readFile(request.filePath);
      const sheetName = request.sheetName ?? workbook.SheetNames[0];
      const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheetName || !worksheet) {
        return { ok: false, reason: 'failed', message: `No sheet named "${request.sheetName}" found. Available sheets: ${workbook.SheetNames.join(', ')}.` };
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null });
      const columnNames = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
      const columns: ColumnStats[] = [];
      for (const column of columnNames) {
        const values = rows.map((r) => r[column]).filter((v): v is number => typeof v === 'number');
        if (values.length === 0) continue;
        const sum = values.reduce((a, b) => a + b, 0);
        columns.push({ column, count: values.length, sum, average: sum / values.length, min: Math.min(...values), max: Math.max(...values) });
      }

      const analysis: SpreadsheetAnalysis = { sheetName, rowCount: rows.length, columns };
      return { ok: true, data: analysis };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Couldn't analyze this spreadsheet: ${(error as Error).message}` };
    }
  }

  describeInProgress(): string {
    return 'Analyzing spreadsheet…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as SpreadsheetAnalysis;
    return `Analyzed "${data.sheetName}" — ${data.rowCount} rows, ${data.columns.length} numeric column(s) with real stats computed.`;
  }
}

export const analyzeSpreadsheetPlugin = new AnalyzeSpreadsheetPlugin();
