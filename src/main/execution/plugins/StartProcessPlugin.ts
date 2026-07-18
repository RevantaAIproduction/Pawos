import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../../shared/actions/ExecutionLifecycle';
import type { PrepareResult } from '../DesktopPlugin';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';
import { resourceManager } from '../ResourceManager';
import { observeProcess } from '../verification/ProcessVerification';
import { firstToken, isAllowedPrefix, allowedPrefixesList } from './commandSafety';

/**
 * For anything meant to keep running (dev servers, watch builds) rather than
 * finish and exit — RunCommandPlugin's buffered exec() has no way to
 * represent "still running and that's fine." Same command allowlist as
 * RunCommandPlugin; starting a background process is not treated as
 * destructive (it changes nothing on disk), but the command itself still
 * has to be one of the allowed dev-tool prefixes.
 */
export class StartProcessPlugin extends BasePlugin {
  id = 'startProcess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'startProcess';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'startProcess') return [];
    if (!isAllowedPrefix(request.command)) {
      return [
        {
          id: 'command-not-allowed',
          message: `I can only start background processes for ${allowedPrefixesList()} commands right now — "${firstToken(request.command)}" isn't one of those.`,
        },
      ];
    }
    if (!fs.existsSync(request.cwd)) {
      return [{ id: 'cwd-missing', message: `I can't find the folder "${request.cwd}" — which project directory did you mean?` }];
    }
    return [];
  }

  /** "If npm run dev is already running for this project, don't start a second one." */
  async prepare(request: ActionRequest): Promise<PrepareResult> {
    if (request.type !== 'startProcess') return { requirements: [] };
    const existing = resourceManager.findRunningProcessByCommand(request.command, request.cwd, request.shell);
    if (!existing) return { requirements: [] };
    return { requirements: [], reuse: { ok: true, data: { ...existing, reused: true, processes: processManager.list() } } };
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'startProcess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isAllowedPrefix(request.command)) return { ok: false, reason: 'not-implemented' };

    const result = await processManager.start(request.command, request.cwd, request.label, request.shell);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { ...result.info, processes: processManager.list() } };
  }

  /** A short window on startup output only — the process itself keeps running well past this and stays covered by the existing process:output live channel. */
  async *observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    if (request.type !== 'startProcess' || !executeResult.ok) return;
    const info = executeResult.data as { id?: string; reused?: boolean } | undefined;
    if (!info?.id || info.reused) return;
    yield* observeProcess(info.id, { timeoutMs: 8_000 });
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'startProcess') return 'Working on that…';
    return `Starting \`${request.command}\`…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'startProcess') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const info = result.data as { id: string; pid: number | null; reused?: boolean } | undefined;
    if (info?.reused) return `\`${request.command}\` was already running (pid ${info.pid}), so I'm using that instead of starting another one.`;
    return `Started \`${request.command}\`${info?.pid ? ` (pid ${info.pid})` : ''}. I'll keep watching its output.`;
  }
}

export const startProcessPlugin = new StartProcessPlugin();
