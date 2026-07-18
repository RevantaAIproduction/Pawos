import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/** Creates a real, permanent history record — always confirmed. */
export class GitCommitPlugin extends BasePlugin {
  id = 'gitCommit';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitCommit';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitCommit') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    if (!request.message.trim()) return [{ id: 'no-message', message: 'What should the commit message say?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitCommit') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await runGit(['commit', '-m', request.message], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { message: request.message } };
  }

  /** Never trust the exit code alone — confirm a real new commit hash actually exists at HEAD. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'gitCommit' || !result.ok) return result;
    const head = await runGit(['rev-parse', 'HEAD'], request.cwd);
    if (!head.ok) return { ok: false, reason: 'failed', message: `Commit may have succeeded, but I couldn't confirm a new commit exists: ${head.message}` };
    return { ok: true, data: { message: request.message, commitHash: head.stdout.trim() } };
  }

  describeInProgress(): string {
    return 'Committing…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitCommit') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { message: string; commitHash?: string };
    return data.commitHash ? `Committed ${data.commitHash.slice(0, 7)}: "${data.message}".` : `Committed: "${data.message}".`;
  }
}

export const gitCommitPlugin = new GitCommitPlugin();
