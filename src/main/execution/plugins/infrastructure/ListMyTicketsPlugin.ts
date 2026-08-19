import type { ActionRequest, ActionRequirement, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { InfraTicket } from '../../../../shared/infrastructure/InfrastructureTypes';
import { summarizeTickets, type TicketSummary } from '../../../../shared/infrastructure/ticketUrgency';
import type { PrepareResult } from '../../DesktopPlugin';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';

type TicketWithSource = InfraTicket & { connectorId: string };
type PerConnectorResult = { connectorId: string; displayName: string; tickets: InfraTicket[] } | { connectorId: string; displayName: string; error: string };

/**
 * Lists tickets assigned to the connected account across every configured project-management
 * connector (Jira/Linear/GitHub Issues) — real evidence via each connector's own `listMyTickets()`
 * (Jira `currentUser()`, Linear `viewer`, GitHub `assignee:@me`), never a client-guessed username.
 * Sibling to InvestigateTicketPlugin — this answers "what's assigned to me," that one answers
 * "tell me about ticket X." Read-only, never gated, same as every other investigation action.
 *
 * Also computes a real urgency/deadline summary (summarizeTickets) from each provider's own
 * priority/dueDate fields — never inferred from labels/text — so both the model's chat response
 * and TicketNotificationWatcher.ts's periodic background check share one source of truth for
 * "what's worth surfacing."
 */
export class ListMyTicketsPlugin extends BasePlugin {
  id = 'listMyTickets';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listMyTickets';
  }

  requirements(request: ActionRequest): ActionRequirement[] {
    if (request.type !== 'listMyTickets') return [];
    if (infrastructureConnectorRegistry.listConfigured('projectManagement').length === 0) {
      return [{ id: 'ticket-access-missing', message: 'Ticket Access needed to continue.', resolvable: { kind: 'capability', category: 'projectManagement' } }];
    }
    return [];
  }

  async prepare(request: ActionRequest): Promise<PrepareResult> {
    return { requirements: this.requirements(request) };
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listMyTickets') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const connectors = [...infrastructureConnectorRegistry.listConfigured('projectManagement')];
    if (connectors.length === 0) {
      return { ok: false, reason: 'failed', message: 'No project management connector is configured (Jira/Linear/GitHub Issues). Connect one from Settings > Connections.' };
    }

    const byConnector: PerConnectorResult[] = [];
    for (const connector of connectors) {
      const result = await connector.listMyTickets();
      if (result.ok) byConnector.push({ connectorId: connector.id, displayName: connector.displayName, tickets: result.tickets });
      else byConnector.push({ connectorId: connector.id, displayName: connector.displayName, error: result.reason });
    }

    const tickets: TicketWithSource[] = byConnector.flatMap((r) => ('tickets' in r ? r.tickets.map((t) => ({ ...t, connectorId: r.connectorId })) : []));
    const failures = byConnector.filter((r): r is { connectorId: string; displayName: string; error: string } => 'error' in r);

    // Honest partial-failure reporting — a connector erroring out never silently drops its
    // tickets from view without a trace, matching InvestigateTicketPlugin's own discipline.
    if (tickets.length === 0 && failures.length > 0) {
      return { ok: false, reason: 'failed', message: `Couldn't list your tickets — ${failures.map((f) => `${f.displayName}: ${f.error}`).join('; ')}` };
    }

    const summary: TicketSummary = summarizeTickets(tickets);
    return { ok: true, data: { tickets, byConnector, summary, partialFailure: failures.length > 0 } };
  }

  describeInProgress(): string {
    return 'Checking your assigned tickets…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listMyTickets') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { tickets: InfraTicket[] };
    return data.tickets.length === 0 ? 'No tickets are currently assigned to you.' : `Found ${data.tickets.length} ticket${data.tickets.length === 1 ? '' : 's'} assigned to you.`;
  }
}

export const listMyTicketsPlugin = new ListMyTicketsPlugin();
