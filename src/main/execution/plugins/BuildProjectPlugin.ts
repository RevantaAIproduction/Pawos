import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ObservationEvent, BuildStatus } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';
import { observeProcess } from '../verification/ProcessVerification';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

const DEFAULT_BUILD_TIMEOUT_MS = 5 * 60 * 1000;
/** Common build-output directory names — existence is a cheap, real post-build signal, not a fabricated check. */
const OUTPUT_DIR_CANDIDATES = ['.next', 'dist', 'build', 'out'];

type BuildState = { processId: string; cwd: string; buildCommand: string; timeoutMs: number };

/** Which candidate output dir actually exists, if any — real evidence, not a guess. */
function findBuildOutputDir(cwd: string): string | null {
  return OUTPUT_DIR_CANDIDATES.find((name) => fs.existsSync(path.join(cwd, name))) ?? null;
}

/** Not destructive — running a build script doesn't deploy or overwrite anything sensitive, only the confirmed steps after it (writeEnvVar, runDeployScript) are. */
export class BuildProjectPlugin extends BasePlugin {
  id = 'buildProject';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'buildProject';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'buildProject') return [];
    if (!fs.existsSync(request.cwd)) {
      return [{ id: 'cwd-missing', message: `I can't find the folder "${request.cwd}" — which project directory did you mean?` }];
    }
    return [];
  }

  /** Only starts the build — observe() does the waiting, so its progress is visible live rather than only reported once everything is already over. */
  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'buildProject') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const startResult = await processManager.start(request.buildCommand, request.cwd, 'build');
    if (!startResult.ok) return { ok: false, reason: 'failed', message: startResult.message };

    const state: BuildState = {
      processId: startResult.info.id,
      cwd: request.cwd,
      buildCommand: request.buildCommand,
      timeoutMs: request.timeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS,
    };
    return { ok: true, data: state };
  }

  async *observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    if (request.type !== 'buildProject' || !executeResult.ok) return;
    const state = executeResult.data as BuildState;
    yield* observeProcess(state.processId, { timeoutMs: state.timeoutMs });
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'buildProject' || !result.ok) return result;
    const state = result.data as BuildState;

    const info = processManager.getInfo(state.processId);
    if (!info || info.status === 'running' || info.status === 'starting') {
      return { ok: false, reason: 'failed', message: `Still building after ${Math.round(state.timeoutMs / 1000)}s.`, data: state };
    }
    if (info.exitCode !== 0) {
      const output = processManager.getOutput(state.processId, 2000);
      const tail = output.ok ? output.output.trim().slice(-500) : '';
      const failedBuild: BuildStatus = {
        status: 'failed',
        buildTool: workspaceMemoryStore.get(state.cwd)?.buildTool ?? undefined,
        durationMs: info.exitedAt ? info.exitedAt - info.startedAt : undefined,
        failureDetail: tail || undefined,
      };
      return {
        ok: false,
        reason: 'failed',
        message: `Build exited with code ${info.exitCode}.${tail ? ` ${tail}` : ''}`,
        data: { command: state.buildCommand, cwd: state.cwd, ...failedBuild },
      };
    }
    const outputDir = findBuildOutputDir(state.cwd);
    if (!outputDir) {
      const failedBuild: BuildStatus = {
        status: 'failed',
        buildTool: workspaceMemoryStore.get(state.cwd)?.buildTool ?? undefined,
        durationMs: info.exitedAt ? info.exitedAt - info.startedAt : undefined,
        failureDetail: "The build command exited successfully, but no build output folder (.next/dist/build/out) appeared.",
      };
      return {
        ok: false,
        reason: 'failed',
        message: "The build command exited successfully, but I don't see a build output folder (.next/dist/build/out) — it may not have actually built.",
        data: { command: state.buildCommand, cwd: state.cwd, ...failedBuild },
      };
    }

    workspaceMemoryStore.recordBuildSuccess(state.cwd);

    // Every field here is something already real and available — never a
    // guess: outputDir is what we just confirmed exists, durationMs is
    // ProcessManager's own real start/exit timestamps, buildTool (when
    // present) is a previously-analyzed project's recorded build tool, not
    // inferred from the output dir name.
    const buildStatus: BuildStatus = {
      status: 'success',
      outputDir,
      durationMs: info.exitedAt ? info.exitedAt - info.startedAt : undefined,
      buildTool: workspaceMemoryStore.get(state.cwd)?.buildTool ?? undefined,
    };
    return { ok: true, data: { command: state.buildCommand, cwd: state.cwd, ...buildStatus } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'buildProject') return 'Working on that…';
    return `Building the project (\`${request.buildCommand}\`)…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'buildProject') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? 'The build succeeded.' : describeFailure(result);
  }
}

export const buildProjectPlugin = new BuildProjectPlugin();
