import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { SoftwareDetectionResult, SoftwareOperationReport, SoftwareVerification } from '../../../shared/actions/SoftwareTypes';
import type { PrepareResult } from '../DesktopPlugin';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { resourceManager } from '../ResourceManager';
import { runToolVersionCheck } from './toolVersionCheck';
import {
  SAFE_PACKAGE_ID,
  SAFE_LAUNCH_COMMAND,
  detectSoftware,
  buildCommand,
  runManagedCommand,
  verifyExecutable,
  verifyLaunch,
} from './softwareManager';

type InstallRequest = Extract<ActionRequest, { type: 'installTool' }>;

/** Carried in ActionResult.data between execute()/verify()/recover() — this plugin's own working state, opaque to everything outside it. */
type InstallState = {
  manager: InstallRequest['manager'];
  packageId: string;
  detectedBefore: SoftwareDetectionResult;
  commandsRun: string[];
  recoveryAttempted: boolean;
};

/** Runs whichever check the caller configured (executableHint, verifyCommand, launchCommand, or the generic manager-level detection as the honest fallback) and reports what it found. */
async function runVerification(request: InstallRequest, manager: InstallRequest['manager'], packageId: string): Promise<{ verified: boolean; verification: SoftwareVerification; message: string }> {
  const verification: SoftwareVerification = {};

  if (request.executableHint) {
    const check = await verifyExecutable(request.executableHint);
    verification.executableChecked = request.executableHint;
    verification.executableFound = check.ok;
    if (check.ok) verification.versionOutput = check.output;
    if (!check.ok) return { verified: false, verification, message: check.message };
  } else if (request.verifyCommand) {
    const check = await runToolVersionCheck(request.verifyCommand);
    if (check.ok) verification.versionOutput = check.output;
    if (!check.ok) return { verified: false, verification, message: check.message };
  }

  if (request.launchCommand && request.expectedProcessName) {
    const launched = await verifyLaunch(request.launchCommand, request.expectedProcessName);
    verification.launchChecked = request.expectedProcessName;
    verification.launchConfirmed = launched;
    if (!launched) return { verified: false, verification, message: `Launched but never saw ${request.expectedProcessName} actually start.` };
  }

  if (!request.executableHint && !request.verifyCommand && !request.launchCommand) {
    const after = await detectSoftware(manager, packageId);
    verification.detectedAfter = after;
    if (!after.installed) {
      return { verified: false, verification, message: "The install command exited successfully, but I still don't see it listed as installed." };
    }
  }

  return { verified: true, verification, message: '' };
}

async function runInstallCommand(
  manager: InstallRequest['manager'],
  packageId: string,
  opts: { asName?: boolean; force?: boolean },
): Promise<{ ok: boolean; command?: string; message?: string }> {
  const command =
    manager === 'winget'
      ? buildCommand('winget', opts.force ? 'repair' : 'install', packageId, { asName: opts.asName })
      : buildCommand(manager, opts.force ? 'repair' : 'install', packageId);
  if (!command) return { ok: false, message: 'This package manager/operation combination is not implemented.' };
  const result = await runManagedCommand(command, `${opts.force ? 'repair-install' : 'install'} ${packageId}`);
  return result.ok ? { ok: true, command } : { ok: false, command, message: result.message };
}

/**
 * Generic Software Installation Runtime — detect, install (with a winget
 * exact-id-then-name fallback), and verify for real (executable/version/
 * launch, or the manager's own detection as an honest minimum). Recovery
 * (a force-reinstall repair pass) is handled by the engine's generic
 * prepare→execute→verify→recover loop via recover() below, not a private
 * retry loop — this plugin only supplies what "repair" means for an install.
 * Works identically for any winget/npm/pip/VS Code extension package; no
 * per-application logic. Always confirmed — installing software is
 * inherently system-changing.
 */
export class InstallToolPlugin extends BasePlugin {
  id = 'installTool';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'installTool';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'installTool') return [];
    if (!SAFE_PACKAGE_ID.test(request.packageId)) {
      return [{ id: 'package-id-invalid', message: `"${request.packageId}" doesn't look like a valid package id.` }];
    }
    if (request.launchCommand && !SAFE_LAUNCH_COMMAND.test(request.launchCommand)) {
      return [{ id: 'launch-command-invalid', message: `"${request.launchCommand}" contains characters I won't launch.` }];
    }
    return [];
  }

  /** "If npm install is already running for this package, don't start another one; if it's already installed, don't reinstall." */
  async prepare(request: ActionRequest): Promise<PrepareResult> {
    if (request.type !== 'installTool' || !SAFE_PACKAGE_ID.test(request.packageId)) return { requirements: [] };
    const { manager, packageId } = request;
    const resourceId = `${manager}:${packageId}`;

    if (resourceManager.isInProgress('software', resourceId)) {
      await resourceManager.acquire('software', resourceId);
    }

    const detectedBefore = await detectSoftware(manager, packageId);
    if (detectedBefore.installed) {
      const state: InstallState = { manager, packageId, detectedBefore, commandsRun: [], recoveryAttempted: false };
      return { requirements: [], reuse: { ok: true, data: state } };
    }

    await resourceManager.acquire('software', resourceId);
    return { requirements: [] };
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'installTool') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!SAFE_PACKAGE_ID.test(request.packageId)) return { ok: false, reason: 'failed', message: 'Invalid package id.' };
    if (request.launchCommand && !SAFE_LAUNCH_COMMAND.test(request.launchCommand)) {
      return { ok: false, reason: 'failed', message: 'Invalid launch command.' };
    }

    const { manager, packageId } = request;
    const resourceId = `${manager}:${packageId}`;
    try {
      const detectedBefore = await detectSoftware(manager, packageId);
      const commandsRun: string[] = [];

      let attempt = await runInstallCommand(manager, packageId, {});
      if (attempt.command) commandsRun.push(attempt.command);
      if (!attempt.ok && manager === 'winget') {
        // Fallback: the given id may actually be a plain name/search term — winget resolves both.
        attempt = await runInstallCommand(manager, packageId, { asName: true });
        if (attempt.command) commandsRun.push(attempt.command);
      }
      if (!attempt.ok) {
        return { ok: false, reason: 'failed', message: `Couldn't install ${packageId}. ${attempt.message}` };
      }

      const state: InstallState = { manager, packageId, detectedBefore, commandsRun, recoveryAttempted: false };
      return { ok: true, data: state };
    } finally {
      // The "installing" phase other concurrent requests for the same package must wait
      // out is done as soon as execute() returns, success or failure — release() is a
      // no-op if this plugin never acquired (e.g. prepare()'s already-installed reuse path).
      resourceManager.release('software', resourceId);
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'installTool' || !result.ok) return result;
    const state = result.data as InstallState;

    const { verified, verification, message } = await runVerification(request, state.manager, state.packageId);
    if (!verified) {
      return { ok: false, reason: 'failed', message: `Installed ${state.packageId}, but verification failed: ${message}`, data: state };
    }

    const report: SoftwareOperationReport = {
      operation: 'install',
      manager: state.manager,
      packageId: state.packageId,
      detectedBefore: state.detectedBefore,
      commandsRun: state.commandsRun,
      verification,
      recoveryAttempted: state.recoveryAttempted,
    };
    return { ok: true, data: report };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'installTool' || result.ok) return result;
    const state = result.data as InstallState | undefined;
    if (!state) return result;

    const repair = await runInstallCommand(state.manager, state.packageId, { force: true });
    if (repair.command) state.commandsRun.push(repair.command);
    state.recoveryAttempted = true;
    if (!repair.ok) {
      return { ok: false, reason: 'failed', message: `Repair attempt failed: ${repair.message}`, data: state };
    }
    return { ok: true, data: state };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'installTool') return 'Working on that…';
    return `Installing ${request.packageId}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'installTool') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const report = result.data as SoftwareOperationReport | undefined;
    if (report?.recoveryAttempted) return `I've installed ${request.packageId} — it needed a repair pass, but it's verified working now.`;
    return `I've installed ${request.packageId} and verified it's working.`;
  }
}

export const installToolPlugin = new InstallToolPlugin();
