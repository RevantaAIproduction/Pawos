import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** A device is revoked individually, never as an all-or-nothing "sign out everywhere" (architecture doc §13.1). */
export class UnpairDevicePlugin extends BasePlugin {
  id = 'unpairDevice';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'unpairDevice';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'unpairDevice') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = communicationRuntime.unpairDevice(request.deviceId);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Unpairing device…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'unpairDevice') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "That device has been unpaired." : describeFailure(result);
  }
}

export const unpairDevicePlugin = new UnpairDevicePlugin();
