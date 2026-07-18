import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationIntelligenceStore } from '../../communication/CommunicationIntelligenceStore';

/**
 * The explicit user-confirmation step for action items the Intelligence
 * Layer detected (architecture doc §11.2) — "I noticed 3 action items —
 * want me to add them as tasks?" only ever fires after the user says yes,
 * same confirm-before-side-effect discipline as every other action-with-
 * consequences in this app. Confirmed items stay tracked ('open'); the
 * conversation layer narrates them as accepted in the same turn.
 */
export class ConfirmCommunicationActionItemsPlugin extends BasePlugin {
  id = 'confirmCommunicationActionItems';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'confirmCommunicationActionItems';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'confirmCommunicationActionItems') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const items = communicationIntelligenceStore.getActionItems(request.communicationId).filter((a) => request.actionItemIds.includes(a.id));
    return { ok: true, data: { confirmed: items } };
  }

  describeInProgress(): string {
    return 'Confirming action items…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'confirmCommunicationActionItems') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const count = (result.data as { confirmed?: unknown[] } | undefined)?.confirmed?.length ?? 0;
    return `Added ${count} action item${count === 1 ? '' : 's'}.`;
  }
}

export const confirmCommunicationActionItemsPlugin = new ConfirmCommunicationActionItemsPlugin();
