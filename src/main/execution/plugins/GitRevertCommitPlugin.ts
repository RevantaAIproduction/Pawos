import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/**
 * Coding Runtime V2, Multi-file Editing Engine (§10) — the safety net for a committed applyCodeEdit
 * batch: without an undo primitive, a self-healing multi-file-edit system has no way back if a user
 * rejects a batch after it's already been committed. `git revert --no-edit <commitSha>` creates a
 * real new commit that inverts the original one, via the same execFile-based runGit() helper as
 * every other git plugin — never a shell string, so commitSha can never inject. A real revert
 * conflict surfaces honestly (git's own "CONFLICT (" output is already classified as `gitConflict`
 * by RecoveryNarration.ts, which is NOT_AUTO_RECOVERABLE — no new classification logic needed here).
 * Always confirmed, same as gitCommit/gitCreateBranch/gitCheckout.
 */
export class GitRevertCommitPlugin extends BasePlugin {
  id = 'gitRevertCommit';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitRevertCommit';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitRevertCommit') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    if (!request.commitSha.trim()) return [{ id: 'no-sha', message: 'Which commit should I revert?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitRevertCommit') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await runGit(['revert', '--no-edit', request.commitSha], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { revertedSha: request.commitSha } };
  }

  /** Never trust the exit code alone — confirm a real new commit hash actually exists at HEAD, same discipline as GitCommitPlugin. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'gitRevertCommit' || !result.ok) return result;
    const head = await runGit(['rev-parse', 'HEAD'], request.cwd);
    if (!head.ok) return { ok: false, reason: 'failed', message: `Revert may have succeeded, but I couldn't confirm a new commit exists: ${head.message}` };
    return { ok: true, data: { revertedSha: request.commitSha, newCommitHash: head.stdout.trim() } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'gitRevertCommit') return 'Working on that…';
    return `Reverting ${request.commitSha.slice(0, 7)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitRevertCommit') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { revertedSha: string; newCommitHash?: string };
    return data.newCommitHash
      ? `Reverted ${data.revertedSha.slice(0, 7)} with a new commit ${data.newCommitHash.slice(0, 7)}.`
      : `Reverted ${data.revertedSha.slice(0, 7)}.`;
  }
}

export const gitRevertCommitPlugin = new GitRevertCommitPlugin();
