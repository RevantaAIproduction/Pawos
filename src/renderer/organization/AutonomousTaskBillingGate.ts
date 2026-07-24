import { autonomousTaskBillingService } from './AutonomousTaskBillingService';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';

const RUNTIME_VERSION = 'pawos-desktop-v1';

/**
 * Handles the three Autonomous Engineering Task billing action types
 * entirely in the renderer — never forwarded to IPC/DesktopExecutionEngine,
 * since billing lives in Organization Runtime (Supabase) and has nothing to
 * do with the local desktop. Same "direct-Supabase action, decorator around
 * the executeAction call site" shape as GovernanceGate.ts, composed with it
 * in useConversationController.ts rather than merged into one file, since
 * governance-gating an action and billing-reporting an action are
 * independent concerns that happen to both intercept before IPC.
 */
export function withAutonomousTaskBilling(execute: (request: ActionRequest) => Promise<ActionResult>): (request: ActionRequest) => Promise<ActionResult> {
  return async (request: ActionRequest): Promise<ActionResult> => {
    switch (request.type) {
      case 'startAutonomousEngineeringTask': {
        try {
          const organizationId = request.organizationId ?? null;
          // Fail fast, before any real work starts, if there's no prepaid
          // credit to back this task — the RPC re-checks this again at
          // completion time as the real guarantee, but refusing here avoids
          // wasting an entire investigate/implement/test cycle on a task
          // that could never actually bill.
          const balance = await autonomousTaskBillingService.getCreditBalance(organizationId);
          if (balance.balance < 1) {
            return {
              ok: false,
              reason: 'failed',
              message: organizationId
                ? "This organization is out of Autonomous Engineering Task credits. Purchase more from Organization → Autonomous Engineering Tasks before starting a new task."
                : 'You\'re out of Autonomous Engineering Task credits. Purchase more from Settings → Billing before starting a new task.',
            };
          }
          const run = await autonomousTaskBillingService.startRun(organizationId, {
            workspaceId: request.workspaceId,
            ticketSource: request.ticketSource ?? null,
            ticketId: request.ticketId,
            repository: request.repository,
            runtimeVersion: RUNTIME_VERSION,
          });
          return { ok: true, data: { runId: run.id } };
        } catch (error) {
          return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      case 'completeAutonomousEngineeringTask': {
        try {
          const eventId = await autonomousTaskBillingService.completeRun(request.runId, {
            prUrl: request.prUrl,
            clientReplySent: request.clientReplySent ?? false,
            deployCompleted: request.deployCompleted ?? false,
          });
          return { ok: true, data: { billingEventId: eventId } };
        } catch (error) {
          return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      case 'endAutonomousEngineeringTask': {
        try {
          await autonomousTaskBillingService.markTerminal(request.runId, request.status);
          return { ok: true };
        } catch (error) {
          return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      default:
        return execute(request);
    }
  };
}
