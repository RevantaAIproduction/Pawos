import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';
import { waitForHttpHealthy, waitForLogPattern, isProcessAlive } from '../verification/ProcessVerification';

/**
 * "Never trust success messages — actually verify." Composes log-pattern
 * detection (a port isn't listening the instant a process spawns) with an
 * HTTP health check, or an exit-code check for a process that's already
 * finished. One model-callable primitive rather than one-off verification
 * logic scattered across every plugin that starts something.
 */
export class CheckProcessHealthPlugin extends BasePlugin {
  id = 'checkProcessHealth';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'checkProcessHealth';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'checkProcessHealth') return [];
    if (!processManager.getInfo(request.processId)) {
      return [{ id: 'process-not-found', message: `I don't have a tracked process with id "${request.processId}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'checkProcessHealth') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const info = processManager.getInfo(request.processId);
    if (!info) return { ok: false, reason: 'failed', message: `No tracked process with id "${request.processId}".` };

    if (info.status !== 'running' && info.status !== 'starting') {
      // Already finished — exit-code check for a finite script, not something meant to keep serving traffic.
      if (info.exitCode === 0) {
        return { ok: true, data: { ready: true, reason: 'exited-cleanly', exitCode: info.exitCode } };
      }
      return { ok: false, reason: 'failed', message: `Process exited with code ${info.exitCode ?? 'unknown'}.` };
    }

    if (request.logPattern) {
      const patternResult = await waitForLogPattern(request.processId, new RegExp(request.logPattern, 'i'), {
        timeoutMs: request.timeoutMs,
      });
      if (!patternResult.ok) return { ok: false, reason: 'failed', message: patternResult.message };
    }

    if (request.url) {
      const httpResult = await waitForHttpHealthy(request.url, { timeoutMs: request.timeoutMs });
      if (!httpResult.ok) return { ok: false, reason: 'failed', message: httpResult.message };
      workspaceMemoryStore.recordBuildSuccess(info.cwd);
      return { ok: true, data: { ready: true, reason: 'http-responding', status: httpResult.status } };
    }

    if (!isProcessAlive(request.processId)) {
      return { ok: false, reason: 'failed', message: 'Process is not running.' };
    }
    workspaceMemoryStore.recordBuildSuccess(info.cwd);
    return { ok: true, data: { ready: true, reason: 'process-alive' } };
  }

  describeInProgress(): string {
    return "Checking whether that's actually ready…";
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'checkProcessHealth') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { reason?: string } | undefined;
    if (data?.reason === 'http-responding') return "It's up and responding.";
    if (data?.reason === 'exited-cleanly') return 'It finished successfully.';
    return "It's running.";
  }
}

export const checkProcessHealthPlugin = new CheckProcessHealthPlugin();
