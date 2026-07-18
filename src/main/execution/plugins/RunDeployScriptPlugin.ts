import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';
import { observeProcess } from '../verification/ProcessVerification';

const DEFAULT_DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

type DeployState = { processId: string; command: string };

/** Runs a project's OWN already-configured deploy command (package.json scripts.deploy, a Vercel/Netlify CLI, etc.) — never invents deployment infrastructure. Always confirmed. */
export class RunDeployScriptPlugin extends BasePlugin {
  id = 'runDeployScript';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'runDeployScript';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'runDeployScript') return [];
    if (!fs.existsSync(request.cwd)) {
      return [{ id: 'cwd-missing', message: `I can't find the folder "${request.cwd}" — which project directory did you mean?` }];
    }
    return [];
  }

  /** Only starts the deploy command — observe() does the waiting, so its progress is visible live. */
  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'runDeployScript') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const startResult = await processManager.start(request.command, request.cwd, 'deploy');
    if (!startResult.ok) return { ok: false, reason: 'failed', message: startResult.message };

    const state: DeployState = { processId: startResult.info.id, command: request.command };
    return { ok: true, data: state };
  }

  async *observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    if (request.type !== 'runDeployScript' || !executeResult.ok) return;
    const state = executeResult.data as DeployState;
    yield* observeProcess(state.processId, { timeoutMs: DEFAULT_DEPLOY_TIMEOUT_MS });
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'runDeployScript' || !result.ok) return result;
    const state = result.data as DeployState;

    const info = processManager.getInfo(state.processId);
    if (!info || info.status === 'running' || info.status === 'starting') {
      return { ok: false, reason: 'failed', message: `Still deploying after ${Math.round(DEFAULT_DEPLOY_TIMEOUT_MS / 1000)}s.`, data: state };
    }
    if (info.exitCode !== 0) {
      const output = processManager.getOutput(state.processId, 2000);
      const tail = output.ok ? output.output.trim().slice(-500) : '';
      return { ok: false, reason: 'failed', message: `Deploy command exited with code ${info.exitCode}.${tail ? ` ${tail}` : ''}`, data: state };
    }

    const output = processManager.getOutput(state.processId, 4000);
    return { ok: true, data: { command: state.command, output: output.ok ? output.output : '' } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'runDeployScript') return 'Working on that…';
    return `Deploying (\`${request.command}\`)…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'runDeployScript') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will run \`${request.command}\` in ${request.cwd} to deploy. Should I go ahead?`;
      return describeFailure(result);
    }
    return "The deploy command finished. I'll verify it's actually responding next.";
  }
}

export const runDeployScriptPlugin = new RunDeployScriptPlugin();
