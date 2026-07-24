import { organizationService } from './OrganizationService';
import { permissionService } from './PermissionService';
import { approvalRequestService } from './ApprovalRequestService';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';

type Governed = { capability: string; summarize: (request: ActionRequest) => string };

/** The only action types Phase 6 gates — matches GovernancePolicyCard's
 * GOVERNABLE_CAPABILITIES list exactly, so a policy toggle in Settings and
 * the enforcement here never drift apart. */
const GOVERNED_ACTIONS: Partial<Record<ActionRequest['type'], Governed>> = {
  deployProject: {
    capability: 'infra.deploy',
    summarize: (r) => (r.type === 'deployProject' ? `Deploy ${r.cwd} to ${r.environment ?? 'production'}` : 'Deploy'),
  },
  rollbackDeployment: {
    capability: 'infra.rollback',
    summarize: (r) => (r.type === 'rollbackDeployment' ? `Roll back ${r.serviceName} to its previous deployment` : 'Roll back a deployment'),
  },
  promoteDeployment: {
    capability: 'infra.promote',
    summarize: (r) => (r.type === 'promoteDeployment' ? `Promote ${r.serviceName} to production` : 'Promote to production'),
  },
};

/**
 * Wraps the same executeAction function ConversationRuntime already calls
 * for every action — a decorator around the call site
 * (useConversationController.ts), not a change to ConversationRuntime,
 * DesktopExecutionEngine, or any plugin. deployProject/rollbackDeployment/
 * promoteDeployment keep executing exactly as before (local,
 * confirmation-gated — the Phase 3 migration's own documented
 * architecture) unless the caller's organization has turned on a
 * "require approval" governance policy for that capability, in which case
 * this creates an organization_approval_requests row and waits for an
 * approvals.decide holder to act on it before letting the real action run.
 */
export function withGovernanceGate(execute: (request: ActionRequest) => Promise<ActionResult>): (request: ActionRequest) => Promise<ActionResult> {
  return async (request: ActionRequest): Promise<ActionResult> => {
    const governed = GOVERNED_ACTIONS[request.type];
    if (!governed) return execute(request);

    let organizationId: string | null = null;
    try {
      const orgs = await organizationService.getMyOrganizations();
      organizationId = orgs[0]?.id ?? null;
    } catch {
      organizationId = null;
    }
    if (!organizationId) return execute(request);

    let required = false;
    try {
      required = await permissionService.isApprovalRequired(organizationId, governed.capability);
    } catch {
      required = false;
    }
    if (!required) return execute(request);

    const summary = governed.summarize(request);
    const approval = await approvalRequestService.request(organizationId, governed.capability, request.type, summary, request as unknown as Record<string, unknown>);

    return new Promise<ActionResult>((resolve) => {
      let settled = false;
      const unsubscribe = approvalRequestService.subscribeToRequests(organizationId as string, async () => {
        if (settled) return;
        const mine = await approvalRequestService.listMine(organizationId as string, 5);
        const updated = mine.find((r) => r.id === approval.id);
        if (!updated || updated.status === 'pending') return;
        settled = true;
        unsubscribe();
        if (updated.status === 'approved') {
          resolve(await execute(request));
        } else {
          resolve({ ok: false, reason: 'failed', message: `"${summary}" requires admin approval and was denied.` });
        }
      });
    });
  };
}
