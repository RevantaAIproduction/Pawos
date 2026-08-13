import * as fs from 'fs';

export const MAX_SPREADSHEET_READ_BYTES = 20 * 1024 * 1024;

export function assertSpreadsheetWithinReadLimit(filePath: string): void {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_SPREADSHEET_READ_BYTES) {
    throw new Error(`Spreadsheet is too large to read safely (${stat.size} bytes).`);
  }
}
