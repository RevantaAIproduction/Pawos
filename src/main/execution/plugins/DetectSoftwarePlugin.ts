import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { SoftwareDetectionResult } from '../../../shared/actions/SoftwareTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { detectSoftware, SAFE_PACKAGE_ID } from './softwareManager';

/** Never guess whether something's installed — check first, via each manager's own real query. Not destructive. */
export class DetectSoftwarePlugin extends BasePlugin {
  id = 'detectSoftware';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'detectSoftware';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'detectSoftware') return [];
    if (!SAFE_PACKAGE_ID.test(request.packageId)) {
      return [{ id: 'package-id-invalid', message: `"${request.packageId}" doesn't look like a valid package id.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'detectSoftware') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await detectSoftware(request.manager, request.packageId);
    return { ok: true, data: result };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'detectSoftware') return 'Checking…';
    return `Checking whether ${request.packageId} is installed…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'detectSoftware') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as SoftwareDetectionResult | undefined;
    if (!data?.installed) return `${request.packageId} isn't installed.`;
    return data.version ? `${request.packageId} is installed (version ${data.version}).` : `${request.packageId} is installed.`;
  }
}

export const detectSoftwarePlugin = new DetectSoftwarePlugin();
