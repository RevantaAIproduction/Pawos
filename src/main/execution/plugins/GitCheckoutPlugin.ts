import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runGit } from './git/runGit';

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/** Switches HEAD/the working tree — can fail loudly (which is correct) rather than silently discard uncommitted changes, since this never passes --force. Always confirmed. */
export class GitCheckoutPlugin extends BasePlugin {
  id = 'gitCheckout';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'gitCheckout';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'gitCheckout') return [];
    if (!isGitRepo(request.cwd)) return [{ id: 'not-a-repo', message: `"${request.cwd}" doesn't look like a git repository.` }];
    if (!request.ref.trim()) return [{ id: 'no-ref', message: 'Which branch or commit should I switch to?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'gitCheckout') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await runGit(['checkout', request.ref], request.cwd);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { ref: request.ref } };
  }

  /** Confirm HEAD actually resolves to the requested ref now — handles both a named branch and a detached-HEAD checkout of a raw commit. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'gitCheckout' || !result.ok) return result;
    const [headSha, targetSha] = await Promise.all([
      runGit(['rev-parse', 'HEAD'], request.cwd),
      runGit(['rev-parse', request.ref], request.cwd),
    ]);
    if (!headSha.ok) return { ok: false, reason: 'failed', message: `Checkout may have succeeded, but I couldn't confirm HEAD moved: ${headSha.message}` };
    if (!targetSha.ok) return { ok: false, reason: 'failed', message: `Checkout may have succeeded, but I couldn't resolve "${request.ref}" to confirm it: ${targetSha.message}` };
    if (headSha.stdout.trim() !== targetSha.stdout.trim()) {
      return { ok: false, reason: 'failed', message: `Checkout reported success, but HEAD doesn't actually point at "${request.ref}".` };
    }
    return { ok: true, data: { ref: request.ref } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'gitCheckout') return 'Working on that…';
    return `Switching to "${request.ref}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'gitCheckout') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { ref: string };
    return `Switched to "${data.ref}".`;
  }
}

export const gitCheckoutPlugin = new GitCheckoutPlugin();
