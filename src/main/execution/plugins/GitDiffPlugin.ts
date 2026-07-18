import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

const MAX_DIFF_CHARS = 12_000;

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

export class GitDiffPlugin extends BasePlugin {
  id = 'gitDiff';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitDiff';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitDiff') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitDiff') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const args = request.staged ? ['diff', '--staged'] : ['diff'];
    const result = await runGit(args, request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    const truncated = result.stdout.length > MAX_DIFF_CHARS;
    return { ok: true, data: { diff: truncated ? result.stdout.slice(0, MAX_DIFF_CHARS) : result.stdout, truncated } };
  }

  describeInProgress(): string {
    return 'Checking the diff…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitDiff') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { diff: string } | undefined;
    return data?.diff.trim() ? "Here's the diff." : 'No changes to show.';
  }
}

export const gitDiffPlugin = new GitDiffPlugin();
