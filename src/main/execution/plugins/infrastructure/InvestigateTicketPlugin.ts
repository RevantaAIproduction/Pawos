import { randomUUID } from 'crypto';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { WorkflowMetadata } from '../../../../shared/actions/ExecutionLifecycle';
import type { PrepareResult } from '../../DesktopPlugin';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { recordIncident } from '../../../memory/entities/infrastructureEntities';
import { requirementGate } from '../../../runtime/RequirementGate';
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

  requirements(request: ActionRequest): ActionRequirement[] {
    if (request.type !== 'investigateTicket') return [];
    if (!request.ticketId.trim()) {
      return [{ id: 'ticket-id-missing', message: 'Which ticket should I investigate?' }];
    }
    // Checkpoint 0 — Ticket Access is always needed just to read the ticket, and it's knowable
    // before any work happens, so it's declared statically here and resolved automatically by
    // the engine (see DesktopExecutionEngine's requirements-check block) — no gate call in
    // execute() for this one.
    if (infrastructureConnectorRegistry.listConfigured('projectManagement').length === 0) {
      return [{ id: 'ticket-access-missing', message: 'Ticket Access needed to continue.', resolvable: { kind: 'capability', category: 'projectManagement' } }];
    }
    return [];
  }

  /** Routes requirements() into the engine's prepare/execute pipeline — BasePlugin's default
   *  prepare() ignores requirements() entirely, so without this override the check above would
   *  never actually run. */
  async prepare(request: ActionRequest): Promise<PrepareResult> {
    return { requirements: this.requirements(request) };
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

    // Checkpoint 1 — Repository Access is only knowable now, once the ticket has been read.
    // Without a local checkout (cwd), there's nothing to inspect and no eventual fix/deploy is
    // possible, so this is exactly the "not cloned" blocker case — pause here rather than
    // silently producing a thin, cwd-less report. Deliberate, temporary asymmetry (stated in
    // CapabilityRequirementResolver): sourceControl has no real ConnectorSDK bridge yet, so this
    // checks the legacy infrastructureConnectorRegistry, not capabilityResolver.
    if (!request.cwd) {
      const gate = await requirementGate.check(
        [{ kind: 'capability', category: 'sourceControl', reasonHint: `I can't find a local checkout to investigate "${ticket.title}" against — connecting a source control provider (or opening the project's folder) lets me continue.` }],
        { scope: request.scope }
      );
      if (gate && !gate.ok) {
        // Honest limitation: this can only ever detect "no connector configured," never
        // "authenticated as the wrong account" — no bound identity exists to compare against
        // with today's PAT-based connectors.
        return {
          ...gate,
          data: {
            preview: true,
            ticket,
            findings,
            proposedApproach: `Once a repository is connected, I can inspect the codebase for "${ticket.title}" and propose specific file changes — this is a plan, not completed work.`,
          },
        };
      }
    }

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
