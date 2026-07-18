import * as fs from 'fs';
import * as path from 'path';
// Deliberately NOT `require('pdf-parse')` — that entry point (index.js) runs
// a `!module.parent`-guarded self-test on load that reads a fixture PDF
// (`./test/data/05-versions-space.pdf`) relative to cwd. Once webpack
// bundles everything into one file, `module.parent` is null at runtime
// even in normal use, so that debug path fires for real and crashes the
// packaged app with ENOENT. lib/pdf-parse.js is the actual implementation,
// with no such side effect.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { XMLParser } from 'fast-xml-parser';
import exifr from 'exifr';
import { imageSize } from 'image-size';

export type ReadableFormat = 'text' | 'pdf' | 'docx' | 'xlsx' | 'csv' | 'json' | 'xml' | 'image-metadata';

export type DocumentReadResult = { content: string; truncated: boolean; metadata?: Record<string, unknown> };

const EXTENSION_FORMAT: Record<string, ReadableFormat> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.csv': 'csv',
  '.json': 'json',
  '.xml': 'xml',
  '.jpg': 'image-metadata',
  '.jpeg': 'image-metadata',
  '.png': 'image-metadata',
  '.gif': 'image-metadata',
  '.webp': 'image-metadata',
  '.tiff': 'image-metadata',
  '.heic': 'image-metadata',
};

/** Picks a reader by extension — 'text' (plain UTF-8) is the fallback for anything unrecognized. */
export function detectFormat(filePath: string): ReadableFormat {
  return EXTENSION_FORMAT[path.extname(filePath).toLowerCase()] ?? 'text';
}

async function readPdf(filePath: string, maxChars: number): Promise<DocumentReadResult> {
  const buffer = await fs.promises.readFile(filePath);
  const data = await pdfParse(buffer);
  const truncated = data.text.length > maxChars;
  return { content: truncated ? data.text.slice(0, maxChars) : data.text, truncated, metadata: { numpages: data.numpages } };
}

async function readDocx(filePath: string, maxChars: number): Promise<DocumentReadResult> {
  const result = await mammoth.extractRawText({ path: filePath });
  const truncated = result.value.length > maxChars;
  return { content: truncated ? result.value.slice(0, maxChars) : result.value, truncated };
}

async function readXlsx(filePath: string, maxChars: number): Promise<DocumentReadResult> {
  const workbook = XLSX.readFile(filePath);
  const parts = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    return sheet ? `# ${name}\n${XLSX.utils.sheet_to_csv(sheet)}` : `# ${name}`;
  });
  const content = parts.join('\n\n');
  const truncated = content.length > maxChars;
  return { content: truncated ? content.slice(0, maxChars) : content, truncated, metadata: { sheetNames: workbook.SheetNames } };
}

async function readCsv(filePath: string, maxChars: number): Promise<DocumentReadResult> {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  const content = JSON.stringify(parsed.data, null, 2);
  const truncated = content.length > maxChars;
  return {
    content: truncated ? content.slice(0, maxChars) : content,
    truncated,
    metadata: { rowCount: parsed.data.length, fields: parsed.meta.fields ?? [] },
  };
}

async function readXml(filePath: string, maxChars: number): Promise<DocumentReadResult> {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(raw);
  const content = JSON.stringify(parsed, null, 2);
  const truncated = content.length > maxChars;
  return { content: truncated ? content.slice(0, maxChars) : content, truncated };
}

async function readImageMetadata(filePath: string): Promise<DocumentReadResult> {
  const buffer = await fs.promises.readFile(filePath);
  const dims = imageSize(buffer);
  let exif: Record<string, unknown> | undefined;
  try {
    exif = await exifr.parse(buffer);
  } catch {
    exif = undefined;
  }
  const metadata = { width: dims.width, height: dims.height, type: dims.type, exif };
  return { content: JSON.stringify(metadata, null, 2), truncated: false, metadata };
}

async function readPlainText(filePath: string, maxChars: number): Promise<DocumentReadResult> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const truncated = content.length > maxChars;
  return { content: truncated ? content.slice(0, maxChars) : content, truncated };
}

/** Dispatches to the right format-aware reader by extension (or an explicit override). Every reader returns plain text content, so downstream code (readFile's result, fileClassifier's content preview) never needs to know which format it came from. */
export async function readDocument(filePath: string, format: ReadableFormat | 'auto', maxChars: number): Promise<DocumentReadResult> {
  const resolved = format === 'auto' ? detectFormat(filePath) : format;
  switch (resolved) {
    case 'pdf':
      return readPdf(filePath, maxChars);
    case 'docx':
      return readDocx(filePath, maxChars);
    case 'xlsx':
      return readXlsx(filePath, maxChars);
    case 'csv':
      return readCsv(filePath, maxChars);
    case 'json':
      return readPlainText(filePath, maxChars);
    case 'xml':
      return readXml(filePath, maxChars);
    case 'image-metadata':
      return readImageMetadata(filePath);
    case 'text':
    default:
      return readPlainText(filePath, maxChars);
  }
}
