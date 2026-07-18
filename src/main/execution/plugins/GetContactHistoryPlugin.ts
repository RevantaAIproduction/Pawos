import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationMemoryStore } from '../../communication/CommunicationMemoryStore';
import { communicationRuntime } from '../../communication/CommunicationRuntime';
import { communicationIntelligenceStore } from '../../communication/CommunicationIntelligenceStore';

/**
 * Participant Intelligence — everything real Communication Memory knows
 * about one person: relationship health, frequently discussed topics
 * (only ever populated once genuinely evidenced across 2+ real
 * communications), communication style, interests, and the real
 * communication history itself with real open action items. Resolvable
 * by id or by real name — never invents a contact that doesn't already
 * exist.
 */
export class GetContactHistoryPlugin extends BasePlugin {
  id = 'getContactHistory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getContactHistory';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getContactHistory') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const participant = request.participantId
      ? communicationMemoryStore.getParticipant(request.participantId)
      : request.participantName
        ? communicationMemoryStore.findParticipantByName(request.participantName)
        : undefined;
    if (!participant) return { ok: false, reason: 'failed', message: `I don't have any real record of "${request.participantName ?? request.participantId ?? ''}" yet.` };

    const communications = participant.communicationIds.map((id) => communicationRuntime.getCommunication(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    const openActionItems = communicationIntelligenceStore.listOpenActionItemsForCommunications(participant.communicationIds);
    const company = participant.companyId ? communicationMemoryStore.getCompany(participant.companyId) : null;

    return { ok: true, data: { participant, company, communications, openActionItems } };
  }

  describeInProgress(): string {
    return 'Pulling together everything I know about this contact…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getContactHistory') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { participant?: { name?: string }; communications?: unknown[] } | undefined;
    const count = data?.communications?.length ?? 0;
    return `Here's what I have on ${data?.participant?.name ?? 'this contact'} — ${count} real communication${count === 1 ? '' : 's'}.`;
  }
}

export const getContactHistoryPlugin = new GetContactHistoryPlugin();
