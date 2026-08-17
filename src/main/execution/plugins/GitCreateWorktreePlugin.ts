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
 * Real workspace isolation for the Autonomous Orchestration Layer — `git worktree add
 * -b <branchName> <worktreePath> <baseRef>`. This is the mechanism that lets an autonomous run
 * operate on its own isolated checkout rather than the user's actual, live one: `cwd` (the
 * user's real checkout) is only ever read from to resolve `baseRef`'s current commit and to run
 * `git worktree add` itself — the worktree command creates a brand-new directory and branch,
 * it never mutates the working tree at `cwd`.
 */
export class GitCreateWorktreePlugin extends BasePlugin {
  id = 'gitCreateWorktree';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitCreateWorktree';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitCreateWorktree') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    if (!request.branchName.trim()) return [{ id: 'no-branch-name', message: 'What should the isolated worktree branch be called?' }];
    if (!request.worktreePath.trim()) return [{ id: 'no-worktree-path', message: 'Where should the isolated worktree be created?' }];
    if (fs.existsSync(request.worktreePath)) {
      return [{ id: 'worktree-path-exists', message: `"${request.worktreePath}" already exists — pick a different, not-yet-existing path for the isolated worktree.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitCreateWorktree') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    // Capture the exact base commit BEFORE creating the worktree, so the caller has a real,
    // known "this is what production/the source checkout looked like" reference — never
    // inferred after the fact.
    const baseRef = request.baseRef ?? 'HEAD';
    const headResult = await runGit(['rev-parse', baseRef], request.cwd);
    if (!headResult.ok) return { ok: false, reason: 'failed', message: `Could not resolve "${baseRef}": ${headResult.message}` };
    const baseCommit = headResult.stdout.trim();

    const parentDir = path.dirname(request.worktreePath);
    if (!fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true });
      } catch (error) {
        return { ok: false, reason: 'failed', message: `Could not create the parent directory for the isolated worktree: ${error instanceof Error ? error.message : String(error)}` };
      }
    }

    const result = await runGit(['worktree', 'add', '-b', request.branchName, request.worktreePath, baseCommit], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    return { ok: true, data: { worktreePath: request.worktreePath, branchName: request.branchName, baseCommit, sourceRepo: request.cwd } };
  }

  /** Confirm the worktree directory and its own .git file genuinely exist, rather than trusting exit 0. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'gitCreateWorktree' || !result.ok) return result;
    if (!isGitRepo(request.worktreePath)) {
      return { ok: false, reason: 'failed', message: `Worktree creation may have reported success, but "${request.worktreePath}" doesn't look like a real git checkout.` };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'gitCreateWorktree') return 'Working on that…';
    return `Creating an isolated workspace at "${request.worktreePath}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitCreateWorktree') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { worktreePath: string; branchName: string; baseCommit: string };
    return `Created an isolated workspace at "${data.worktreePath}" on branch "${data.branchName}" (from ${data.baseCommit.slice(0, 7)}).`;
  }
}

export const gitCreateWorktreePlugin = new GitCreateWorktreePlugin();
