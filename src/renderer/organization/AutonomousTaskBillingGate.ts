import { autonomousTaskBillingService } from './AutonomousTaskBillingService';
import { getTicketUnitPriceUsd } from '../../shared/organization/AutonomousTaskBillingTypes';
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
          // Fail fast, before any real work starts, if the ticket balance can't cover this
          // account's *next* ticket at its current volume-tiered rate — the RPC re-checks this
          // again at completion time as the real guarantee, but refusing here avoids wasting an
          // entire investigate/implement/test cycle on a task that could never actually bill.
          const balance = await autonomousTaskBillingService.getTicketBalance(organizationId);
          const nextTicketPrice = getTicketUnitPriceUsd(balance.ticketsUsedCount + 1);
          if (balance.balanceUsd < nextTicketPrice) {
            return {
              ok: false,
              reason: 'failed',
              message: organizationId
                ? `This organization's ticket balance ($${balance.balanceUsd.toFixed(2)}) can't cover the next ticket at the current rate ($${nextTicketPrice.toFixed(2)}). Add funds from Organization → Autonomous Ticket System before starting a new task.`
                : `Your ticket balance ($${balance.balanceUsd.toFixed(2)}) can't cover the next ticket at the current rate ($${nextTicketPrice.toFixed(2)}). Add funds from Settings → Billing before starting a new task.`,
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
          // This path is model-driven — prUrl is a free-text claim, never independently checked
          // against GitHub/GitLab (no such connector capability exists yet). prVerified/
          // ticketVerified are therefore always explicitly false here, so this event is always
          // honestly tagged 'self_reported', never 'connector_verified' — that distinction is
          // reserved for genuine first-party connector code once it exists (see
          // AutonomousTaskBillingService.completeRun()'s own comment).
          const eventId = await autonomousTaskBillingService.completeRun(request.runId, {
            prUrl: request.prUrl,
            clientReplySent: request.clientReplySent ?? false,
            deployCompleted: request.deployCompleted ?? false,
            prVerified: false,
            ticketVerified: false,
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
