import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { classifyAndIndexFile } from './fileClassifier';
import { findFileEntityByPath, type FileAttributes } from '../../memory/entities/fileEntities';
import { upsertWorkspace } from '../../memory/entities/workspaceEntities';

const MAX_FILES_PER_INDEX_RUN = 200;
const MAX_DEPTH = 6;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);
const INDEXABLE_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md']);

async function collectCandidates(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number) {
    if (files.length >= MAX_FILES_PER_INDEX_RUN || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES_PER_INDEX_RUN) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (INDEXABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(dir, entry.name));
      }
    }
  }

  await walk(root, 0);
  return files;
}

/**
 * The ONE deliberate full sweep in the whole File Runtime — used only for
 * first-time discovery of a workspace or an explicit user-requested
 * re-index. Every other change (Paw's own file operations, external edits
 * caught by the watcher) goes through the scoped onFileCreated/Modified/
 * Moved/Deleted/Restored hooks in fileEntities.ts instead — this plugin is
 * never called reactively as a side effect of those.
 */
export class IndexWorkspacePlugin extends BasePlugin {
  id = 'indexWorkspace';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'indexWorkspace';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'indexWorkspace') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find "${request.rootPath}" — which folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'indexWorkspace') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      upsertWorkspace(request.workspaceName ?? path.basename(request.rootPath), 'project', [request.rootPath]);

      const candidates = await collectCandidates(request.rootPath);
      let indexed = 0;
      let skipped = 0;

      for (const filePath of candidates) {
        const stat = await fs.promises.stat(filePath);
        const existing = findFileEntityByPath(filePath);
        const attrs = existing?.attributes as FileAttributes | undefined;
        // Incremental even within a sweep: skip files whose mtime already matches what's indexed.
        if (attrs?.mtime === stat.mtimeMs) {
          skipped += 1;
          continue;
        }
        const result = await classifyAndIndexFile(filePath);
        if (result) indexed += 1;
      }

      return { ok: true, data: { candidateCount: candidates.length, indexed, skipped } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'indexWorkspace') return 'Working on that…';
    return `Getting to know ${path.basename(request.rootPath)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'indexWorkspace') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { indexed?: number; skipped?: number } | undefined;
    return `I've gone through ${path.basename(request.rootPath)} — indexed ${data?.indexed ?? 0} file${(data?.indexed ?? 0) === 1 ? '' : 's'}${data?.skipped ? ` (${data.skipped} already up to date)` : ''}.`;
  }
}

export const indexWorkspacePlugin = new IndexWorkspacePlugin();
