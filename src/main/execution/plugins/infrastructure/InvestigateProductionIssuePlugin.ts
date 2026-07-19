import { randomUUID } from 'crypto';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { WorkflowMetadata } from '../../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { recordIncident } from '../../../memory/entities/infrastructureEntities';
import { gatherProductionEvidence, buildEngineeringReport, type InvestigationEvidence } from './investigationCore';
import type { EngineeringReport } from '../../../../shared/infrastructure/EngineeringReportTypes';

type InvestigationResult = InvestigationEvidence & { description: string; findings: string[]; engineeringReport: EngineeringReport };

/**
 * The Autonomous Engineering Loop's entry point for a reported issue with no
 * ticket — "Fix production," "Production is slow," "Users cannot login,"
 * "Payment is failing." Same real evidence-gathering core as
 * InvestigateTicketPlugin (investigationCore.ts), just starting from a
 * free-text description instead of a ticket lookup, and assembling the same
 * formal Engineering Report. Never proposes a fix itself. Read-only, never gated.
 */
export class InvestigateProductionIssuePlugin extends BasePlugin {
  id = 'investigateProductionIssue';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'investigateProductionIssue';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'investigateProductionIssue') return [];
    if (!request.description.trim()) {
      return [{ id: 'description-missing', message: 'What seems to be going wrong?' }];
    }
    if (!request.cwd) {
      return [{ id: 'cwd-missing', message: 'Which project is this about, so I can find the right service to investigate?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'investigateProductionIssue') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const plan = ['Understand request'];
    const findings: string[] = [`Reported issue: "${request.description}"`];

    const evidence = await gatherProductionEvidence(request.cwd, `investigate-issue-${Date.now()}`, plan, findings);
    const engineeringReport = buildEngineeringReport(request.description, evidence, findings);

    const incident = recordIncident({ title: request.description, serviceName: evidence.matchedService, status: 'investigating', openedAt: Date.now() });
    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'incident',
      serviceName: evidence.matchedService,
      summary: `Investigated: "${request.description}"`,
      status: 'success',
      at: Date.now(),
      refs: { incidentEntityId: incident.id },
    });
    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'engineeringReport',
      serviceName: evidence.matchedService,
      summary: `Engineering report: "${request.description}"`,
      status: 'success',
      at: Date.now(),
      report: engineeringReport,
    });

    const workflowMeta: WorkflowMetadata = {
      workflowName: `Investigate: ${request.description.slice(0, 40)}`,
      plan,
      candidatesProcessed: 1,
      successfulSteps: 1,
      failedSteps: 0,
    };
    const result: InvestigationResult = { description: request.description, findings, engineeringReport, ...evidence };
    return { ok: true, data: { ...result, ...workflowMeta } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'investigateProductionIssue') return 'Working on that…';
    return `Investigating: ${request.description}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'investigateProductionIssue') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as InvestigationResult;
    return `Investigated "${data.description}" — ${data.findings.length} findings gathered${data.matchedService ? ` for service "${data.matchedService}"` : ''}.`;
  }
}

export const investigateProductionIssuePlugin = new InvestigateProductionIssuePlugin();
