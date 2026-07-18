import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { SAFE_VERSION_COMMAND, runToolVersionCheck } from './toolVersionCheck';

/**
 * Deliberately narrower than RunCommandPlugin's dev-tool allowlist, but for
 * a different reason: this needs to work for ANY installed CLI (docker,
 * java, mvn, gradle, ...), not just the fixed dev-tool set — so instead of
 * an allowlist of program names, it allowlists the SHAPE of the command: a
 * bare program name (no path separators, no shell metacharacters) followed
 * by one of a small set of version-query flags. Nothing here can execute
 * arbitrary code regardless of what "tool" is asked about.
 */
function isAllowed(command: string): boolean {
  return SAFE_VERSION_COMMAND.test(command.trim());
}

export class VerifyToolInstalledPlugin extends BasePlugin {
  id = 'verifyToolInstalled';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'verifyToolInstalled';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'verifyToolInstalled') return [];
    if (!isAllowed(request.command)) {
      return [
        {
          id: 'command-shape-not-allowed',
          message: `I can only check a bare program name plus a version flag (e.g. "git --version") — "${request.command}" isn't shaped like that.`,
        },
      ];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'verifyToolInstalled') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isAllowed(request.command)) return { ok: false, reason: 'not-implemented' };

    const result = await runToolVersionCheck(request.command);
    return result.ok ? { ok: true, data: { installed: true, output: result.output } } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'verifyToolInstalled') return 'Checking…';
    return `Checking whether ${request.command.split(' ')[0]} is installed…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'verifyToolInstalled') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { output?: string } | undefined;
    return data?.output ? `It's installed — ${data.output.split('\n')[0]}` : "It's installed.";
  }
}

export const verifyToolInstalledPlugin = new VerifyToolInstalledPlugin();
