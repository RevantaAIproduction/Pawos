import { randomUUID } from 'crypto';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { WorkflowMetadata } from '../../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { recordIncident } from '../../../memory/entities/infrastructureEntities';
import { gatherProductionEvidence, buildEngineeringReport, type InvestigationEvidence } from './investigationCore';
import type { InfraTicket } from '../../../../shared/infrastructure/InfrastructureTypes';
import type { EngineeringReport } from '../../../../shared/infrastructure/EngineeringReportTypes';

type InvestigationResult = InvestigationEvidence & { ticket: InfraTicket; findings: string[]; engineeringReport: EngineeringReport };

/**
 * Enterprise Ticket Intelligence — reads a real ticket, then hands off to
 * the shared investigationCore for real evidence gathering (project
 * context, latest commit, live health check, real browser console/network
 * inspection, prior engineering history, Root Cause Engine correlation) and
 * assembles a formal Engineering Report from it. Deliberately never
 * proposes a fix itself — same "never ranks/recommends" discipline as
 * ComparisonWorkflowPlugin — the model reasons over this real evidence
 * afterward and, if it decides on a fix, goes through the normal gated
 * write_file/git_commit/deploy_project/promote_deployment actions with
 * their own confirmations. Read-only, never gated.
 */
export class InvestigateTicketPlugin extends BasePlugin {
  id = 'investigateTicket';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'investigateTicket';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'investigateTicket') return [];
    if (!request.ticketId.trim()) {
      return [{ id: 'ticket-id-missing', message: 'Which ticket should I investigate?' }];
    }
    return [];
  }

  private async fetchTicket(ticketId: string): Promise<{ ok: true; ticket: InfraTicket } | { ok: false; reason: string }> {
    const connectors = [...infrastructureConnectorRegistry.listConfigured('projectManagement')];
    if (connectors.length === 0) {
      return { ok: false, reason: 'No project management connector is configured (Jira/Linear/GitHub Issues). Add one to .env to let me read tickets.' };
    }
    const failures: string[] = [];
    for (const connector of connectors) {
      const result = await connector.getTicket(ticketId);
      if (result.ok) return { ok: true, ticket: result.ticket };
      failures.push(`${connector.displayName}: ${result.reason}`);
    }
    return { ok: false, reason: `Couldn't find ticket "${ticketId}" in any configured system — ${failures.join('; ')}` };
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'investigateTicket') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const ticketResult = await this.fetchTicket(request.ticketId);
    if (!ticketResult.ok) return { ok: false, reason: 'failed', message: ticketResult.reason };
    const ticket = ticketResult.ticket;

    const plan = ['Read ticket', 'Understand issue'];
    const findings: string[] = [`Ticket ${ticket.id}: "${ticket.title}"${ticket.status ? ` (status: ${ticket.status})` : ''}.`];

    const evidence = await gatherProductionEvidence(request.cwd, `investigate-${ticket.id}`, plan, findings);
    const engineeringReport = buildEngineeringReport(`${ticket.id}: ${ticket.title}`, evidence, findings);

    const incident = recordIncident({ title: ticket.title, serviceName: evidence.matchedService, status: 'investigating', openedAt: Date.now() });
    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'incident',
      serviceName: evidence.matchedService,
      summary: `Investigated ticket ${ticket.id}: "${ticket.title}"`,
      status: 'success',
      at: Date.now(),
      refs: { ticketId: ticket.id, incidentEntityId: incident.id },
    });
    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'engineeringReport',
      serviceName: evidence.matchedService,
      summary: `Engineering report for ticket ${ticket.id}: "${ticket.title}"`,
      status: 'success',
      at: Date.now(),
      refs: { ticketId: ticket.id },
      report: engineeringReport,
    });

    const workflowMeta: WorkflowMetadata = { workflowName: `Investigate: ${ticket.id}`, plan, candidatesProcessed: 1, successfulSteps: 1, failedSteps: 0 };
    const result: InvestigationResult = { ticket, findings, engineeringReport, ...evidence };
    return { ok: true, data: { ...result, ...workflowMeta } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'investigateTicket') return 'Working on that…';
    return `Investigating ticket ${request.ticketId}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'investigateTicket') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as InvestigationResult;
    return `Investigated "${data.ticket.title}" — ${data.findings.length} findings gathered${data.matchedService ? ` for service "${data.matchedService}"` : ''}.`;
  }
}

export const investigateTicketPlugin = new InvestigateTicketPlugin();
