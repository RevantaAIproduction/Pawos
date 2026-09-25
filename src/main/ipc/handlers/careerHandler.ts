import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runCareerTool } from '../../career/CareerService';
import { BuildPdfGenerator } from '../../billing/BuildPdfGenerator';
import { detectFormat, readDocument } from '../../execution/plugins/documentReaders';
import type { BuildPdfDocument } from '../../../shared/billing/BuildPdfTypes';
import type { CareerImportResult, CareerPdfExportResult, CareerToolRequest } from '../../../shared/career/CareerTypes';

const MAX_IMPORT_CHARS = 20_000;
const IMPORTABLE_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'];

function isPdfDocument(value: unknown): value is BuildPdfDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as BuildPdfDocument;
  return typeof doc.title === 'string' && Array.isArray(doc.sections);
}

function safeFileName(name: string): string {
  const base = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim().slice(0, 80) || 'PawOS document';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

/**
 * Career tools IPC — the renderer's only way to run the ATS/resume/career tools (entitlement and
 * capacity are enforced inside CareerService, never trusted from the renderer), import a resume
 * file, and export any generated document as a PDF the user chooses where to save.
 */
export function registerCareerIpc(): void {
  ipcMain.handle('career:run', (_evt, request: CareerToolRequest) => runCareerTool(request));

  ipcMain.handle('career:importResume', async (evt): Promise<CareerImportResult> => {
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const picked = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Choose your resume',
      properties: ['openFile'],
      filters: [{ name: 'Resume', extensions: IMPORTABLE_EXTENSIONS }],
    });
    const filePath = picked.filePaths[0];
    if (picked.canceled || !filePath) return { ok: false, canceled: true };
    const extension = path.extname(filePath).slice(1).toLowerCase();
    if (!IMPORTABLE_EXTENSIONS.includes(extension)) return { ok: false, reason: 'Choose a PDF, DOCX or text file.' };
    try {
      const format = extension === 'txt' || extension === 'md' ? 'text' : detectFormat(filePath);
      const read = await readDocument(filePath, format, MAX_IMPORT_CHARS);
      const text = read.content.trim();
      if (!text) return { ok: false, reason: 'No text could be read from that file. If it is a scanned image, paste the text instead.' };
      return { ok: true, fileName: path.basename(filePath), text, truncated: read.truncated };
    } catch (err) {
      return { ok: false, reason: `Could not read that file: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  ipcMain.handle('career:exportPdf', async (evt, doc: BuildPdfDocument, suggestedName: string): Promise<CareerPdfExportResult> => {
    if (!isPdfDocument(doc)) return { ok: false, reason: 'Nothing to export.' };
    let bytes: Uint8Array;
    try {
      bytes = await BuildPdfGenerator.generate(doc);
    } catch (err) {
      return { ok: false, reason: `Could not create the PDF: ${err instanceof Error ? err.message : String(err)}` };
    }
    const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
    const target = await dialog.showSaveDialog(win as BrowserWindow, {
      title: 'Save PDF',
      defaultPath: safeFileName(typeof suggestedName === 'string' ? suggestedName : doc.title),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (target.canceled || !target.filePath) return { ok: false, canceled: true };
    try {
      await fs.writeFile(target.filePath, bytes);
      return { ok: true, filePath: target.filePath };
    } catch (err) {
      return { ok: false, reason: `Could not save the PDF: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  ipcMain.handle('career:revealFile', (_evt, filePath: string) => {
    if (typeof filePath === 'string' && filePath.toLowerCase().endsWith('.pdf')) shell.showItemInFolder(filePath);
  });
}
