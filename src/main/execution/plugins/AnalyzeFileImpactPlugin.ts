import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { fileContentMatches } from './contentScan';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);
const MAX_DEPTH = 6;
const MAX_CANDIDATES_EXAMINED = 5000;
const MAX_RESULTS = 100;

async function collectSourceFiles(root: string, excludePath: string): Promise<string[]> {
  const files: string[] = [];
  let examined = 0;

  async function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || examined >= MAX_CANDIDATES_EXAMINED) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (examined >= MAX_CANDIDATES_EXAMINED) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
        continue;
      }
      examined += 1;
      if (path.resolve(full) !== path.resolve(excludePath)) files.push(full);
    }
  }

  await walk(root, 0);
  return files;
}

/**
 * "File impact analysis" — a best-effort, honest heuristic: which other
 * project files reference this file's basename (without extension) in
 * their content, as a plain substring match (reusing contentScan.ts's
 * fileContentMatches, the same bounded/binary-safe scan SearchFilesPlugin
 * already uses). This is NOT a real import/AST dependency graph — no
 * module resolution, no re-export tracing — and is labeled as such in the
 * result so it's never mistaken for one. Read-only — available in both
 * Paw Go and Paw Pro.
 */
export class AnalyzeFileImpactPlugin extends BasePlugin {
  id = 'analyzeFileImpact';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeFileImpact';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeFileImpact') return [];
    if (!fs.existsSync(request.filePath)) {
      return [{ id: 'file-missing', message: `I can't find the file "${request.filePath}" — which file did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeFileImpact') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.filePath)) return { ok: false, reason: 'failed', message: `"${request.filePath}" doesn't exist.` };

    const basename = path.basename(request.filePath, path.extname(request.filePath));
    const candidates = await collectSourceFiles(request.rootPath, request.filePath);
    const referencingFiles: string[] = [];
    for (const candidate of candidates) {
      if (referencingFiles.length >= MAX_RESULTS) break;
      if (await fileContentMatches(candidate, basename)) referencingFiles.push(candidate);
    }

    return {
      ok: true,
      data: {
        filePath: request.filePath,
        referencingFiles,
        method: 'substring-match-on-basename',
        note: 'Best-effort text match, not a real import/dependency graph.',
      },
    };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'analyzeFileImpact') return 'Working on that…';
    return `Checking what references ${path.basename(request.filePath)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeFileImpact') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { referencingFiles: string[] } | undefined;
    const count = data?.referencingFiles.length ?? 0;
    return count === 0
      ? `I didn't find anything else referencing ${path.basename(request.filePath)}.`
      : `${count} other file${count === 1 ? '' : 's'} reference${count === 1 ? 's' : ''} ${path.basename(request.filePath)} (best-effort text match, not a full dependency graph).`;
  }
}

export const analyzeFileImpactPlugin = new AnalyzeFileImpactPlugin();
