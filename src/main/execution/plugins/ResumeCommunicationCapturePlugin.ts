import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

export class ResumeCommunicationCapturePlugin extends BasePlugin {
  id = 'resumeCommunicationCapture';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'resumeCommunicationCapture';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'resumeCommunicationCapture') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = communicationRuntime.resumeCapture(request.communicationId);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Resuming the recording…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'resumeCommunicationCapture') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've resumed recording." : describeFailure(result);
  }
}

export const resumeCommunicationCapturePlugin = new ResumeCommunicationCapturePlugin();
