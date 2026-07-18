import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

export class GetCommunicationPlugin extends BasePlugin {
  id = 'getCommunication';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getCommunication';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getCommunication') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const record = communicationRuntime.getCommunication(request.communicationId);
    if (!record) return { ok: false, reason: 'failed', message: 'Communication not found.' };
    return { ok: true, data: record };
  }

  describeInProgress(): string {
    return 'Looking up that communication…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getCommunication') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "Here's what I found." : describeFailure(result);
  }
}

export const getCommunicationPlugin = new GetCommunicationPlugin();
