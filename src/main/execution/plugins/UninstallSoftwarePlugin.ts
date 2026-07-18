import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { SoftwareDetectionResult, SoftwareOperationReport } from '../../../shared/actions/SoftwareTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { SAFE_PACKAGE_ID, detectSoftware, buildCommand, runManagedCommand } from './softwareManager';

type UninstallRequest = Extract<ActionRequest, { type: 'uninstallSoftware' }>;

type UninstallState = {
  manager: UninstallRequest['manager'];
  packageId: string;
  detectedBefore: SoftwareDetectionResult;
  commandsRun: string[];
};

export class UninstallSoftwarePlugin extends BasePlugin {
  id = 'uninstallSoftware';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'uninstallSoftware';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'uninstallSoftware') return [];
    if (!SAFE_PACKAGE_ID.test(request.packageId)) {
      return [{ id: 'package-id-invalid', message: `"${request.packageId}" doesn't look like a valid package id.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'uninstallSoftware') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!SAFE_PACKAGE_ID.test(request.packageId)) return { ok: false, reason: 'failed', message: 'Invalid package id.' };

    const { manager, packageId } = request;
    const detectedBefore = await detectSoftware(manager, packageId);
    const command = buildCommand(manager, 'uninstall', packageId);
    if (!command) return { ok: false, reason: 'not-implemented' };

    const result = await runManagedCommand(command, `uninstall ${packageId}`);
    if (!result.ok) return { ok: false, reason: 'failed', message: `Couldn't uninstall ${packageId}. ${result.message}` };

    const state: UninstallState = { manager, packageId, detectedBefore, commandsRun: [command] };
    return { ok: true, data: state };
  }

  /** Never trust the exit code alone — re-detect the package and fail honestly if it's still there. */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'uninstallSoftware' || !result.ok) return result;
    const state = result.data as UninstallState;

    const detectedAfter = await detectSoftware(state.manager, state.packageId);
    if (detectedAfter.installed) {
      return { ok: false, reason: 'failed', message: `The uninstall command exited successfully, but ${state.packageId} still shows as installed.`, data: state };
    }

    const report: SoftwareOperationReport = {
      operation: 'uninstall',
      manager: state.manager,
      packageId: state.packageId,
      detectedBefore: state.detectedBefore,
      commandsRun: state.commandsRun,
      verification: { detectedAfter },
      recoveryAttempted: false,
    };
    return { ok: true, data: report };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'uninstallSoftware' || result.ok) return result;
    const state = result.data as UninstallState | undefined;
    if (!state) return result;

    const command = buildCommand(state.manager, 'uninstall', state.packageId);
    if (!command) return result;
    const retry = await runManagedCommand(command, `uninstall ${state.packageId}`);
    state.commandsRun.push(command);
    if (!retry.ok) {
      return { ok: false, reason: 'failed', message: `Uninstall retry failed: ${retry.message}`, data: state };
    }
    return { ok: true, data: state };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'uninstallSoftware') return 'Working on that…';
    return `Uninstalling ${request.packageId}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'uninstallSoftware') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will uninstall ${request.packageId}. Should I go ahead?`;
      return describeFailure(result);
    }
    return `I've uninstalled ${request.packageId}.`;
  }
}

export const uninstallSoftwarePlugin = new UninstallSoftwarePlugin();
