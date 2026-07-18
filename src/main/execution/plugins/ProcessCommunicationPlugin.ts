import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** Runs the real transcribe -> summarize -> extract action items -> detect signals -> update memory pipeline (architecture doc §11/§18) — `apiKey` is always injected by ConversationRuntime right before execution, same precedent as every other Gemini-backed action. */
export class ProcessCommunicationPlugin extends BasePlugin {
  id = 'processCommunication';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'processCommunication';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'processCommunication') return [];
    if (!request.apiKey) return [{ id: 'no-gemini-key', message: 'Processing a communication needs a Gemini API key configured first.' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'processCommunication') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.apiKey) return { ok: false, reason: 'failed', message: 'No Gemini API key configured.' };
    const result = await communicationRuntime.processCommunication(request.communicationId, request.apiKey);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: result.data };
  }

  describeInProgress(): string {
    return 'Transcribing and analyzing the conversation…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'processCommunication') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return "I've transcribed and summarized it, and pulled out any action items and follow-ups.";
  }
}

export const processCommunicationPlugin = new ProcessCommunicationPlugin();
