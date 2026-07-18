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
 * Not destructive — staging is trivially reversible (git reset touches the
 * index only, never file content) and is almost always the immediate
 * precursor to a gitCommit call, which IS gated; requiring a second
 * confirmation for the staging half of one logical "commit this" action
 * would just be worse UX for no real safety benefit.
 */
export class GitAddPlugin extends BasePlugin {
  id = 'gitAdd';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitAdd';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitAdd') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitAdd') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const paths = request.paths && request.paths.length > 0 ? request.paths : ['.'];

    const addResult = await runGit(['add', '--', ...paths], request.cwd);
    if (!addResult.ok) return { ok: false, reason: 'failed', message: addResult.message };

    // Real verification, not a trusted exit code — ask git what's actually staged now.
    const stagedResult = await runGit(['diff', '--cached', '--name-only'], request.cwd);
    const staged = stagedResult.ok ? stagedResult.stdout.split('\n').map((f) => f.trim()).filter(Boolean) : [];
    return { ok: true, data: { staged } };
  }

  describeInProgress(): string {
    return 'Staging changes…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitAdd') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { staged: string[] };
    return data.staged.length > 0 ? `Staged ${data.staged.length} file${data.staged.length === 1 ? '' : 's'}.` : 'Nothing new to stage.';
  }
}

export const gitAddPlugin = new GitAddPlugin();
