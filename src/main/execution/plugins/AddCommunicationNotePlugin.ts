import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** Free-text, user-authored notes attached to a communication — stored separately from the auto-generated summary so Paw's output and the user's own words never overwrite each other (architecture doc §6.4). */
export class AddCommunicationNotePlugin extends BasePlugin {
  id = 'addCommunicationNote';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'addCommunicationNote';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'addCommunicationNote') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = communicationRuntime.addNote(request.communicationId, request.note);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Adding your note…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'addCommunicationNote') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've added your note." : describeFailure(result);
  }
}

export const addCommunicationNotePlugin = new AddCommunicationNotePlugin();
