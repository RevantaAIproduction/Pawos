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
    const args = request.staged ? ['diff', '--staged', '--numstat'] : ['diff', '--numstat'];
    const result = await runGit(args, request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: parseNumstat(result.stdout) };
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
