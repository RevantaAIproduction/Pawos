import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { observationEngine } from '../../memory/ObservationEngine';
import { findFileEntityByPath, type FileAttributes } from '../../memory/entities/fileEntities';

const TEMP_EXTENSIONS = new Set(['.tmp', '.crdownload', '.part', '.download']);
const STALE_INSTALLER_EXTENSIONS = new Set(['.exe', '.msi', '.dmg', '.pkg']);
const STALE_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type Suggestion = { action: 'move' | 'delete' | 'archive'; targetPath: string; destination?: string; reason: string; confidence: number };

async function listFilesShallow(root: string): Promise<{ path: string; stat: fs.Stats }[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: { path: string; stat: fs.Stats }[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    try {
      files.push({ path: full, stat: await fs.promises.stat(full) });
    } catch {
      // unreadable — skip
    }
  }
  return files;
}

/**
 * Advisory only — NEVER mutates anything. Returns ranked suggestions;
 * mutation only ever happens via already-existing movePath/deletePath/
 * compressPath calls, issued by the model after the user confirms what
 * this returns. This is what satisfies "Clean my Downloads folder": Paw
 * calls analyzeFolder(purpose:'downloads-cleanup'), presents the preview
 * from these suggestions, and only after confirmation issues the batch of
 * real operations — no monolithic cleanupDownloads action.
 */
export class AnalyzeFolderPlugin extends BasePlugin {
  id = 'analyzeFolder';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeFolder';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeFolder') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeFolder') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const files = await listFilesShallow(request.path);
      const now = Date.now();
      const suggestions: Suggestion[] = [];

      for (const { path: filePath, stat } of files) {
        const ext = path.extname(filePath).toLowerCase();
        const ageMs = now - stat.mtimeMs;

        if ((request.purpose === 'temp-files' || request.purpose === 'downloads-cleanup') && TEMP_EXTENSIONS.has(ext)) {
          suggestions.push({ action: 'delete', targetPath: filePath, reason: 'Looks like a leftover temporary/partial download file.', confidence: 0.8 });
          continue;
        }

        if (request.purpose === 'downloads-cleanup' && STALE_INSTALLER_EXTENSIONS.has(ext) && ageMs > STALE_DAYS_MS) {
          suggestions.push({ action: 'delete', targetPath: filePath, reason: `Installer, untouched for over ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days.`, confidence: 0.6 });
          continue;
        }

        if (request.purpose === 'archive-suggestion' && ageMs > STALE_DAYS_MS) {
          suggestions.push({ action: 'archive', targetPath: filePath, reason: 'Not touched in over 30 days — a good candidate to archive.', confidence: 0.5 });
        }

        if (request.purpose === 'sort-by-project') {
          const entity = findFileEntityByPath(filePath);
          const attrs = entity?.attributes as FileAttributes | undefined;
          if (attrs?.mentions.projects.length) {
            suggestions.push({
              action: 'move',
              targetPath: filePath,
              destination: attrs.mentions.projects[0],
              reason: `This looks like it belongs to "${attrs.mentions.projects[0]}" based on what's indexed about it.`,
              confidence: 0.6,
            });
          }
        }
      }

      const observations = observationEngine.replaceKind(
        `analyzeFolder:${request.path}:${request.purpose}`,
        suggestions.map((s) => ({
          kind: 'folderSuggestion',
          text: `${s.action} "${path.basename(s.targetPath)}" — ${s.reason}`,
          entityRefs: [s.targetPath],
          basis: [{ source: 'taskExecution' as const, detail: s.reason }],
        })),
        60 * 60 * 1000
      );

      return { ok: true, data: { suggestions, observationCount: observations.length } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'analyzeFolder') return 'Working on that…';
    return `Looking through ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeFolder') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { suggestions?: Suggestion[] } | undefined;
    const count = data?.suggestions?.length ?? 0;
    return count === 0 ? "I didn't find anything worth flagging." : `I found ${count} suggestion${count === 1 ? '' : 's'} — want me to show them?`;
  }
}

export const analyzeFolderPlugin = new AnalyzeFolderPlugin();
