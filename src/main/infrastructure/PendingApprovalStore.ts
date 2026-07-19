import type { ActionRequest } from '../../shared/actions/ActionTypes';

export type PendingApproval = {
  id: string;
  actionType: string;
  serviceName?: string;
  summary: string;
  requestedAt: number;
};

/**
 * Backs an honest, single-user "Approval Queue" — not a fabricated
 * multi-user RBAC system. A pending approval exists only between the moment
 * DesktopExecutionEngine returns requires-confirmation for a production-
 * impacting infra action and the moment the user answers (resolved either
 * way, confirmed or not); deliberately in-memory only, since a pending
 * confirmation tied to a live conversation turn has no meaning after a
 * restart. Reused, not modified, wherever the existing confirm-then-retry
 * gate already lives — see DesktopExecutionEngine.execute().
 */
class PendingApprovalStore {
  private pending = new Map<string, PendingApproval>();

  record(entry: PendingApproval): void {
    this.pending.set(entry.id, entry);
  }

  resolve(id: string): void {
    this.pending.delete(id);
  }

  list(): PendingApproval[] {
    return [...this.pending.values()].sort((a, b) => b.requestedAt - a.requestedAt);
  }
}

export const pendingApprovalStore = new PendingApprovalStore();

/** Derives a stable id/summary for the infra actions this queue tracks — undefined for anything else. */
export function deriveApprovalKey(request: ActionRequest): { id: string; actionType: string; serviceName?: string; summary: string } | undefined {
  if (request.type === 'deployProject') {
    return { id: `deployProject:${request.cwd}`, actionType: request.type, summary: `Deploy ${request.cwd} to ${request.environment ?? 'production'}` };
  }
  if (request.type === 'rollbackDeployment') {
    return { id: `rollbackDeployment:${request.serviceName}`, actionType: request.type, serviceName: request.serviceName, summary: `Roll back ${request.serviceName} to its previous deployment` };
  }
  if (request.type === 'promoteDeployment') {
    return { id: `promoteDeployment:${request.serviceName}`, actionType: request.type, serviceName: request.serviceName, summary: `Promote ${request.serviceName} to production` };
  }
  return undefined;
}
