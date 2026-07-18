import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

export class PauseCommunicationCapturePlugin extends BasePlugin {
  id = 'pauseCommunicationCapture';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'pauseCommunicationCapture';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'pauseCommunicationCapture') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = communicationRuntime.pauseCapture(request.communicationId);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Pausing the recording…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'pauseCommunicationCapture') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've paused recording." : describeFailure(result);
  }
}

export const pauseCommunicationCapturePlugin = new PauseCommunicationCapturePlugin();
