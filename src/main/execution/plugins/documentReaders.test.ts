import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectFormat, readDocument } from './documentReaders';

function writeTempFile(name: string, content: Buffer | string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-document-reader-test-'));
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('documentReaders image metadata safety', () => {
  it('detects denied image formats as image metadata requests', () => {
    expect(detectFormat('sample.icns')).toBe('image-metadata');
    expect(detectFormat('sample.jxl')).toBe('image-metadata');
    expect(detectFormat('sample.heif')).toBe('image-metadata');
  });

  it('blocks denied image metadata formats before invoking image-size parser code', async () => {
    const filePath = writeTempFile('sample.heif', Buffer.from('not parsed'));
    const result = await readDocument(filePath, 'auto', 1000);

    expect(result.metadata).toMatchObject({ blocked: true });
    expect(result.content).toContain('disabled');
  });
});

describe('documentReaders spreadsheet safety', () => {
  it('blocks oversized spreadsheets before invoking SheetJS parsing', async () => {
    const filePath = writeTempFile('large.xlsx', '');
    fs.truncateSync(filePath, 20 * 1024 * 1024 + 1);

    await expect(readDocument(filePath, 'auto', 1000)).rejects.toThrow('too large to read safely');
  });
});
