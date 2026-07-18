import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { GitBranchResult } from '../../../shared/actions/GitTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/** List/current only — no branch creation, deletion, or switching. Reading and debugging are the priority; writing to repositories comes later. */
export class GitBranchPlugin extends BasePlugin {
  id = 'gitBranch';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitBranch';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitBranch') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitBranch') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const currentResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], request.cwd);
    if (!currentResult.ok) return { ok: false, reason: 'failed', message: currentResult.message };

    const listResult = await runGit(['branch', '--list', '--format=%(refname:short)'], request.cwd);
    if (!listResult.ok) return { ok: false, reason: 'failed', message: listResult.message };

    const data: GitBranchResult = {
      current: currentResult.stdout.trim(),
      branches: listResult.stdout.split('\n').map((b) => b.trim()).filter(Boolean),
    };
    return { ok: true, data };
  }

  describeInProgress(): string {
    return 'Checking branches…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitBranch') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as GitBranchResult;
    return `On "${data.current}" — ${data.branches.length} branch${data.branches.length === 1 ? '' : 'es'} total.`;
  }
}

export const gitBranchPlugin = new GitBranchPlugin();
