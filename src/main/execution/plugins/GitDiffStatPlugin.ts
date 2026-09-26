import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { CodeDiffStat, FileDiffStat } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

const MAX_COUNTED_FILE_BYTES = 2 * 1024 * 1024;

/** Lines in a new text file (0 for binary, unreadable or very large files). */
function countTextLines(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_COUNTED_FILE_BYTES) return 0;
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) return 0; // binary
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').length;
    return text.endsWith('\n') ? lines - 1 : lines;
  } catch {
    return 0;
  }
}

/** Parses `git diff --numstat` output: "<added>\t<deleted>\t<path>" per line, "-" for binary files (not counted). */
function parseNumstat(output: string): CodeDiffStat {
  const filesChanged: FileDiffStat[] = [];
  let totalAdded = 0;
  let totalDeleted = 0;
  for (const line of output.split('\n')) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match || match[3] === undefined) continue;
    const added = match[1] === '-' ? 0 : Number(match[1]);
    const deleted = match[2] === '-' ? 0 : Number(match[2]);
    filesChanged.push({ path: match[3], added, deleted });
    totalAdded += added;
    totalDeleted += deleted;
  }
  return { filesChanged, totalAdded, totalDeleted };
}

/**
 * "Live Code Diff" — real per-file +/- line counts via `git diff --numstat`
 * (same execFile-args-array runGit helper as every other git plugin, never
 * a shell string). Only ever available for git-tracked projects; honestly
 * fails otherwise rather than fabricating a line count.
 */
export class GitDiffStatPlugin extends BasePlugin {
  id = 'gitDiffStat';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitDiffStat';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitDiffStat') return [];
    if (!isGitRepo(request.cwd)) {
      return [{ id: 'not-a-repo', message: `"${request.cwd}" isn't a git repository — line-level diff stats are only available for git-tracked projects.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitDiffStat') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isGitRepo(request.cwd)) {
      return { ok: false, reason: 'failed', message: `"${request.cwd}" isn't a git repository — line-level diff stats are only available for git-tracked projects.` };
    }
    if (request.includeUntracked) return this.executeWorkingTree(request.cwd);
    const args = request.staged ? ['diff', '--staged', '--numstat'] : ['diff', '--numstat'];
    const result = await runGit(args, request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: parseNumstat(result.stdout) };
  }

  /**
   * Everything a pull request would contain: staged + unstaged changes vs HEAD, plus new files git
   * doesn't track yet (their lines count as added; binary / very large files count as 0 lines).
   * A repository with no commits yet has no HEAD — then only the working-tree diff is compared.
   */
  private async executeWorkingTree(cwd: string): Promise<ActionResult> {
    const vsHead = await runGit(['diff', 'HEAD', '--numstat'], cwd);
    const tracked = vsHead.ok ? vsHead : await runGit(['diff', '--numstat'], cwd);
    if (!tracked.ok) return { ok: false, reason: 'failed', message: tracked.message };
    const stat = parseNumstat(tracked.stdout);

    const untracked = await runGit(['ls-files', '--others', '--exclude-standard'], cwd);
    if (untracked.ok) {
      for (const relative of untracked.stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
        const added = countTextLines(path.join(cwd, relative));
        stat.filesChanged.push({ path: relative, added, deleted: 0 });
        stat.totalAdded += added;
      }
    }
    return { ok: true, data: stat };
  }

  describeInProgress(): string {
    return 'Checking what changed…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitDiffStat') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { filesChanged: FileDiffStat[]; totalAdded: number; totalDeleted: number } | undefined;
    if (!data || data.filesChanged.length === 0) return 'No changes to show.';
    return `${data.filesChanged.length} file${data.filesChanged.length === 1 ? '' : 's'} changed, +${data.totalAdded}/-${data.totalDeleted} lines.`;
  }
}

export const gitDiffStatPlugin = new GitDiffStatPlugin();
