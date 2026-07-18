import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { SoftwareDetectionResult, SoftwareOperationReport } from '../../../shared/actions/SoftwareTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { runToolVersionCheck } from './toolVersionCheck';
import { SAFE_PACKAGE_ID, detectSoftware, buildCommand, runManagedCommand, verifyExecutable } from './softwareManager';

type RepairRequest = Extract<ActionRequest, { type: 'repairSoftware' }>;

type RepairState = {
  manager: RepairRequest['manager'];
  packageId: string;
  detectedBefore: SoftwareDetectionResult;
  commandsRun: string[];
};

async function checkExecutable(request: RepairRequest): Promise<{ ok: boolean; versionOutput?: string; message?: string }> {
  if (request.executableHint) {
    const check = await verifyExecutable(request.executableHint);
    return check.ok ? { ok: true, versionOutput: check.output } : { ok: false, message: check.message };
  }
  if (request.verifyCommand) {
    const check = await runToolVersionCheck(request.verifyCommand);
    return check.ok ? { ok: true, versionOutput: check.output } : { ok: false, message: check.message };
  }
  return { ok: true };
}

/**
 * A forced reinstall over the existing installation — for a broken/partial
 * install, not a routine update. Real verification (not just "the command
 * exited 0"): if the caller gave an executableHint/verifyCommand, it must
 * actually pass, or the engine's recover() loop retries the repair once more.
 */
export class RepairSoftwarePlugin extends BasePlugin {
  id = 'repairSoftware';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'repairSoftware';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'repairSoftware') return [];
    if (!SAFE_PACKAGE_ID.test(request.packageId)) {
      return [{ id: 'package-id-invalid', message: `"${request.packageId}" doesn't look like a valid package id.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'repairSoftware') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!SAFE_PACKAGE_ID.test(request.packageId)) return { ok: false, reason: 'failed', message: 'Invalid package id.' };

    const { manager, packageId } = request;
    const detectedBefore = await detectSoftware(manager, packageId);
    const command = buildCommand(manager, 'repair', packageId);
    if (!command) return { ok: false, reason: 'not-implemented' };

    const result = await runManagedCommand(command, `repair ${packageId}`);
    if (!result.ok) return { ok: false, reason: 'failed', message: `Couldn't repair ${packageId}. ${result.message}` };

    const state: RepairState = { manager, packageId, detectedBefore, commandsRun: [command] };
    return { ok: true, data: state };
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'repairSoftware' || !result.ok) return result;
    const state = result.data as RepairState;

    const executableCheck = await checkExecutable(request);
    if (!executableCheck.ok) {
      return { ok: false, reason: 'failed', message: `Repaired, but verification failed: ${executableCheck.message}`, data: state };
    }
    const detectedAfter = await detectSoftware(state.manager, state.packageId);

    const report: SoftwareOperationReport = {
      operation: 'repair',
      manager: state.manager,
      packageId: state.packageId,
      detectedBefore: state.detectedBefore,
      commandsRun: state.commandsRun,
      verification: { detectedAfter, versionOutput: executableCheck.versionOutput },
      recoveryAttempted: false,
    };
    return { ok: true, data: report };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'repairSoftware' || result.ok) return result;
    const state = result.data as RepairState | undefined;
    if (!state) return result;

    const command = buildCommand(state.manager, 'repair', state.packageId);
    if (!command) return result;
    const retry = await runManagedCommand(command, `repair ${state.packageId}`);
    state.commandsRun.push(command);
    if (!retry.ok) {
      return { ok: false, reason: 'failed', message: `Repair retry failed: ${retry.message}`, data: state };
    }
    return { ok: true, data: state };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'repairSoftware') return 'Working on that…';
    return `Repairing ${request.packageId}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'repairSoftware') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will reinstall ${request.packageId} to repair it. Should I go ahead?`;
      return describeFailure(result);
    }
    return `I've repaired ${request.packageId}.`;
  }
}

export const repairSoftwarePlugin = new RepairSoftwarePlugin();
