import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** Crash recovery (architecture doc §18) — resumes every communication whose pipeline never reached 'done' from its last completed stage. `apiKey` is always injected by ConversationRuntime; without one, interrupted recordings are still marked honestly but AI pipeline stages are left for a later retry. */
export class ResumeInterruptedCommunicationsPlugin extends BasePlugin {
  id = 'resumeInterruptedCommunications';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'resumeInterruptedCommunications';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'resumeInterruptedCommunications') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await communicationRuntime.resumeInterrupted(request.apiKey);
    return { ok: true, data: result };
  }

  describeInProgress(): string {
    return 'Checking for interrupted recordings…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'resumeInterruptedCommunications') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const count = (result.data as { resumedCommunicationIds?: unknown[] } | undefined)?.resumedCommunicationIds?.length ?? 0;
    return count > 0 ? `Resumed ${count} interrupted recording${count === 1 ? '' : 's'}.` : 'No interrupted recordings to resume.';
  }
}

export const resumeInterruptedCommunicationsPlugin = new ResumeInterruptedCommunicationsPlugin();
