import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { GitStatusResult } from '../../../shared/actions/GitTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

function parseGitStatus(output: string): GitStatusResult {
  const lines = output.split('\n').filter(Boolean);
  const branchLine = lines.find((l) => l.startsWith('##'));

  let branch = 'unknown';
  let ahead = 0;
  let behind = 0;
  if (branchLine) {
    const nameMatch = branchLine.match(/^## ([^ .]+)/);
    if (nameMatch?.[1]) branch = nameMatch[1];
    const aheadMatch = branchLine.match(/ahead (\d+)/);
    const behindMatch = branchLine.match(/behind (\d+)/);
    if (aheadMatch) ahead = Number(aheadMatch[1]);
    if (behindMatch) behind = Number(behindMatch[1]);
  }

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  for (const line of lines) {
    if (line.startsWith('##')) continue;
    const code = line.slice(0, 2);
    const file = line.slice(3);
    if (code === '??') {
      untracked.push(file);
      continue;
    }
    if (code[0] !== ' ') staged.push(file);
    if (code[1] !== ' ') unstaged.push(file);
  }

  return { branch, ahead, behind, staged, unstaged, untracked, clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0 };
}

/** Structured (not raw-text) so the debugging loop can programmatically check "is the repo dirty" without re-parsing a preview every time. */
export class GitStatusPlugin extends BasePlugin {
  id = 'gitStatus';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitStatus';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitStatus') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitStatus') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await runGit(['status', '--porcelain=v1', '-b'], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    const status = parseGitStatus(result.stdout);
    workspaceMemoryStore.recordGitStatus(request.cwd, status);
    return { ok: true, data: status };
  }

  describeInProgress(): string {
    return 'Checking git status…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitStatus') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const status = result.data as GitStatusResult;
    if (status.clean) return `On "${status.branch}", working tree is clean.`;
    return `On "${status.branch}": ${status.staged.length} staged, ${status.unstaged.length} unstaged, ${status.untracked.length} untracked.`;
  }
}

export const gitStatusPlugin = new GitStatusPlugin();
