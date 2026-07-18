import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** The Unified Communication Timeline (architecture doc §8) — meetings, calls, voice notes, emails, messages, and follow-ups interleaved chronologically, optionally scoped by participant/company/project/date/medium. */
export class GetCommunicationTimelinePlugin extends BasePlugin {
  id = 'getCommunicationTimeline';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getCommunicationTimeline';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getCommunicationTimeline') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entries = communicationRuntime.getTimeline(request.scope);
    return { ok: true, data: { entries } };
  }

  describeInProgress(): string {
    return 'Pulling up your communication timeline…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getCommunicationTimeline') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const count = (result.data as { entries?: unknown[] } | undefined)?.entries?.length ?? 0;
    return `Found ${count} item${count === 1 ? '' : 's'} in the timeline.`;
  }
}

export const getCommunicationTimelinePlugin = new GetCommunicationTimelinePlugin();
