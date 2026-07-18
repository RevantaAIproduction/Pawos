import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { SoftwareOperationReport } from '../../../shared/actions/SoftwareTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { SAFE_PACKAGE_ID, detectSoftware, buildCommand, runManagedCommand } from './softwareManager';

export class UpdateSoftwarePlugin extends BasePlugin {
  id = 'updateSoftware';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'updateSoftware';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'updateSoftware') return [];
    if (!SAFE_PACKAGE_ID.test(request.packageId)) {
      return [{ id: 'package-id-invalid', message: `"${request.packageId}" doesn't look like a valid package id.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'updateSoftware') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!SAFE_PACKAGE_ID.test(request.packageId)) return { ok: false, reason: 'failed', message: 'Invalid package id.' };

    const { manager, packageId } = request;
    const detectedBefore = await detectSoftware(manager, packageId);
    const command = buildCommand(manager, 'update', packageId);
    if (!command) return { ok: false, reason: 'not-implemented' };

    const result = await runManagedCommand(command, `update ${packageId}`);
    if (!result.ok) return { ok: false, reason: 'failed', message: `Couldn't update ${packageId}. ${result.message}` };

    const detectedAfter = await detectSoftware(manager, packageId);
    const report: SoftwareOperationReport = {
      operation: 'update',
      manager,
      packageId,
      detectedBefore,
      commandsRun: [command],
      verification: { detectedAfter },
      recoveryAttempted: false,
    };
    return { ok: true, data: report };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'updateSoftware') return 'Working on that…';
    return `Updating ${request.packageId}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'updateSoftware') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will update ${request.packageId}. Should I go ahead?`;
      return describeFailure(result);
    }
    return `I've updated ${request.packageId}.`;
  }
}

export const updateSoftwarePlugin = new UpdateSoftwarePlugin();
