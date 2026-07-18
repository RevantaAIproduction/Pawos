import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/** Creates the branch only — never switches to it (see gitCheckout for that). Confirmed, matching createFolder's precedent for state-mutating creation. */
export class GitCreateBranchPlugin extends BasePlugin {
  id = 'gitCreateBranch';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitCreateBranch';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitCreateBranch') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    if (!request.branchName.trim()) return [{ id: 'no-name', message: 'What should the new branch be called?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitCreateBranch') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await runGit(['branch', request.branchName], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { branchName: request.branchName } };
  }

  /** Confirm the ref actually exists now, rather than trusting exit 0. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'gitCreateBranch' || !result.ok) return result;
    const check = await runGit(['rev-parse', '--verify', request.branchName], request.cwd);
    if (!check.ok) return { ok: false, reason: 'failed', message: `Branch creation may have succeeded, but I couldn't confirm "${request.branchName}" exists: ${check.message}` };
    return { ok: true, data: { branchName: request.branchName } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'gitCreateBranch') return 'Working on that…';
    return `Creating branch "${request.branchName}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitCreateBranch') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { branchName: string };
    return `Created branch "${data.branchName}".`;
  }
}

export const gitCreateBranchPlugin = new GitCreateBranchPlugin();
