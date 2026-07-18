import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

export class StopCommunicationCapturePlugin extends BasePlugin {
  id = 'stopCommunicationCapture';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'stopCommunicationCapture';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'stopCommunicationCapture') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await communicationRuntime.stopCapture(request.communicationId);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { communicationId: request.communicationId } };
  }

  describeInProgress(): string {
    return 'Finishing the recording…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'stopCommunicationCapture') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return "Recording stopped. I'll process it now — transcribe it, summarize it, and pull out any action items.";
  }
}

export const stopCommunicationCapturePlugin = new StopCommunicationCapturePlugin();
