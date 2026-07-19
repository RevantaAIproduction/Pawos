import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { pendingApprovalStore } from '../../../infrastructure/PendingApprovalStore';

/** Read-only "what's waiting on my approval right now" — backs the Workspace UI's Approval Queue region. Never gated. */
export class GetApprovalQueuePlugin extends BasePlugin {
  id = 'getApprovalQueue';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getApprovalQueue';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: { pending: pendingApprovalStore.list() } };
  }

  describeInProgress(): string {
    return 'Checking pending approvals…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { pending: { summary: string }[] };
    return data.pending.length > 0 ? `${data.pending.length} action(s) waiting on your approval.` : 'Nothing is waiting on your approval.';
  }
}

export const getApprovalQueuePlugin = new GetApprovalQueuePlugin();
