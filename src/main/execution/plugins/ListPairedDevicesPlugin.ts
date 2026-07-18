import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

export class ListPairedDevicesPlugin extends BasePlugin {
  id = 'listPairedDevices';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listPairedDevices';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: { devices: communicationRuntime.listPairedDevices() } };
  }

  describeInProgress(): string {
    return 'Checking paired devices…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listPairedDevices') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const count = (result.data as { devices?: unknown[] } | undefined)?.devices?.length ?? 0;
    return count > 0 ? `You have ${count} paired device${count === 1 ? '' : 's'}.` : "You don't have any paired devices yet.";
  }
}

export const listPairedDevicesPlugin = new ListPairedDevicesPlugin();
