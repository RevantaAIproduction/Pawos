import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

const MAX_SHOW_CHARS = 12_000;

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/** Shows a commit, tag, or file at a ref — e.g. "what did commit abc123 actually change." Read-only. */
export class GitShowPlugin extends BasePlugin {
  id = 'gitShow';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitShow';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitShow') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    if (!request.ref.trim()) return [{ id: 'ref-missing', message: 'Which commit, tag, or ref did you want to see?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitShow') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    // Args array, not a shell string — ref is passed as a single argv entry,
    // so it can never be interpreted as an extra flag/command regardless of
    // its content.
    const result = await runGit(['show', request.ref], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    const truncated = result.stdout.length > MAX_SHOW_CHARS;
    return { ok: true, data: { content: truncated ? result.stdout.slice(0, MAX_SHOW_CHARS) : result.stdout, truncated } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'gitShow') return 'Working on that…';
    return `Looking at ${request.ref}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitShow') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "Here's what that shows." : describeFailure(result);
  }
}

export const gitShowPlugin = new GitShowPlugin();
