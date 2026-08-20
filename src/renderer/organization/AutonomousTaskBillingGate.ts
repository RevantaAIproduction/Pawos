import { autonomousTaskBillingService } from './AutonomousTaskBillingService';
import { getTicketUnitPriceUsd } from '../../shared/organization/AutonomousTaskBillingTypes';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { getIpcBridge } from '../services/ipc/ipcBridge';
import { getSupabaseClient } from '../auth/supabaseClient';
import { orchestrateAutonomousRun } from './AutonomousOrchestrator';

const RUNTIME_VERSION = 'pawos-desktop-v1';

/** ticket_source values that have a real, connectable ConnectorSDK today (Jira, Linear, GitHub
 *  Issues) — 'azureDevOps' is deliberately excluded: no Azure DevOps connector exists anywhere in
 *  this codebase, so there is nothing real to check "connected" against for it. */
export const CONNECTOR_ID_BY_TICKET_SOURCE: Partial<Record<string, string>> = {
  jira: 'jira',
  linear: 'linear',
  github: 'github',
};

/**
 * Dispatches a window CustomEvent asking the Dashboard shell to show the
 * pre-execution authorization modal. Returns true (authorized) or false
 * (cancelled). If no UI handler is mounted (headless / test context), the
 * detail._handled flag stays false and this resolves true immediately so
 * existing test suites are unaffected — the gate's own entitlement and
 * balance checks are the real safety gates.
 */
function requestAutonomousWorkAuthorization(opts: {
  ticketId: string | null;
  ticketTitle?: string | null;
  balanceUsd: number;
  nextTicketPriceUsd: number;
}): Promise<boolean> {
  // Non-browser environments (Node test runner, headless scripts) have no
  // window — proceed automatically without any UI.
  if (typeof window === 'undefined') return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function settle(v: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(v);
    }

    const detail = { ...opts, resolve: settle, _handled: false };
    window.dispatchEvent(new CustomEvent('paw:requestAutonomousAuthorization', { detail }));

    if (!detail._handled) {
      // No modal mounted (headless / test context) — proceed automatically.
      settle(true);
      return;
    }
    // 5-minute safety timeout: auto-cancel if the user never responds.
    timeoutId = setTimeout(() => settle(false), 5 * 60 * 1000);
  });
}

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
          // Trusted server-side gate — Autonomous Work ('autonomousTaskBilling') is Pro Max/Team/
          // Enterprise-only (Go/Pro must never be able to start a billable autonomous run, even by
          // invoking this path directly rather than through a renderer button). Always re-checked
          // against the real, main-process EntitlementService via IPC on every call — never a cached
          // renderer-side flag a caller could stall or spoof — and checked before any ticket-balance
          // read or Supabase write below.
          const canRunAutonomousWork = await getIpcBridge().entitlementIsFeatureAvailable('autonomousTaskBilling');
          if (!canRunAutonomousWork) {
            // The exact required tier is re-derived from the real EntitlementService table (never
            // hardcoded here) so the UI's upgrade recommendation can never drift out of sync with
            // which tier actually unlocks Autonomous Work.
            const tierRequirements = await getIpcBridge().entitlementGetFeatureTierRequirements();
            return {
              ok: false,
              reason: 'entitlement-restricted',
              message: 'Autonomous Work requires Paw Pro Max or higher. Upgrade from Settings → Billing to start an autonomous engineering task.',
              data: { requiredFeature: 'autonomousTaskBilling', requiredTier: tierRequirements.autonomousTaskBilling ?? null },
            };
          }

          // Connector-connected gate — if this ticket genuinely comes from a tracker PawOS has a
          // real connector for (Jira/Linear/GitHub Issues), that connector must actually be
          // connected before any work begins. Never starts investigating a ticket it can't
          // ultimately read/report back to. A ticketless run (no ticketSource) has nothing to check
          // here and proceeds unaffected — this must never regress normal, non-tracker autonomous
          // requests.
          const requiredConnectorId = request.ticketSource ? CONNECTOR_ID_BY_TICKET_SOURCE[request.ticketSource] : undefined;
          if (requiredConnectorId) {
            const supabase = await getSupabaseClient();
            const { data: userData } = await supabase.auth.getUser();
            const scope = { userId: userData.user?.id ?? '', organizationId: request.organizationId };
            const statusResult = await getIpcBridge().connectivityGetStatus(requiredConnectorId, scope);
            const isConnected = statusResult.ok && (statusResult.data.state === 'connected' || statusResult.data.state === 'syncing');
            if (!isConnected) {
              return {
                ok: false,
                reason: 'failed',
                message: `BLOCKED — ${connectorDisplayName(requiredConnectorId)} is not connected. Connect it from Settings → Connections before starting an autonomous task on a ${connectorDisplayName(requiredConnectorId)} ticket.`,
              };
            }
          }

          // Fail fast, before any real work starts, if the ticket balance can't cover this
          // account's *next* ticket at its current volume-tiered rate — the RPC re-checks this
          // again at completion time as the real guarantee, but refusing here avoids wasting an
          // entire investigate/implement/test cycle on a task that could never actually bill.
          const organizationId = request.organizationId ?? null;
          const balance = await autonomousTaskBillingService.getTicketBalance(organizationId);
          const nextTicketPrice = getTicketUnitPriceUsd(balance.ticketsUsedCount + 1);
          if (balance.balanceUsd < nextTicketPrice) {
            // Distinct from 'entitlement-restricted' (this account's plan already includes
            // Autonomous Work — the tier gate above already passed) and from 'usage-restricted'
            // (a different currency: monthly Paw Compute allowance, not this prepaid Ticket
            // Balance) — 'balance-restricted' lets describeLaunchFailure render a real "add funds"
            // prompt instead of the generic Retry pill a plain 'failed' would get, since retrying
            // this exact call can never succeed until the balance actually changes.
            return {
              ok: false,
              reason: 'balance-restricted',
              message: organizationId
                ? `This organization's ticket balance ($${balance.balanceUsd.toFixed(2)}) can't cover the next ticket at the current rate ($${nextTicketPrice.toFixed(2)}). Add funds from Organization → Autonomous Ticket System before starting a new task.`
                : `Your ticket balance ($${balance.balanceUsd.toFixed(2)}) can't cover the next ticket at the current rate ($${nextTicketPrice.toFixed(2)}). Add funds from Settings → Billing before starting a new task.`,
              data: { balanceUsd: balance.balanceUsd, nextTicketPriceUsd: nextTicketPrice, organizationId },
            };
          }

          // Pre-execution UI authorization — shows the ticket details, current charge, and wallet
          // balance to the user and waits for explicit approval before any Supabase run row is
          // created. If the Dashboard authorization modal is not mounted (headless / test context),
          // the event detail's _handled flag stays false and the gate proceeds immediately —
          // this must never block or throw in a non-UI context.
          const authorized = await requestAutonomousWorkAuthorization({
            ticketId: request.ticketId ?? null,
            ticketTitle: request.ticketTitle ?? null,
            balanceUsd: balance.balanceUsd,
            nextTicketPriceUsd: nextTicketPrice,
          });
          if (!authorized) {
            return { ok: false, reason: 'cancelled', message: 'Autonomous Work authorization cancelled.' };
          }

          // Duplicate-safe start — see AutonomousTaskBillingService.startRun()'s own doc comment.
          // Reusing an already-active run instead of creating a second one for the same ticket
          // closes the double-execution/double-billing gap a retried or concurrent request would
          // otherwise open.
          const { run, alreadyActive } = await autonomousTaskBillingService.startRun(organizationId, {
            workspaceId: request.workspaceId,
            ticketSource: request.ticketSource ?? null,
            ticketId: request.ticketId,
            repository: request.repository,
            runtimeVersion: RUNTIME_VERSION,
          });
          if (alreadyActive) {
            return {
              ok: true,
              data: {
                runId: run.id,
                alreadyActive: true,
                balanceUsd: balance.balanceUsd,
                currentTicketPriceUsd: nextTicketPrice,
                message: `An autonomous run for this ticket is already in progress (started ${run.startedAt}). Continue that run instead of starting a new one.`,
              },
            };
          }

          // Autonomous Orchestration Layer kickoff — only when a real local repository path was
          // supplied. Absent, this falls back unchanged to the pre-orchestration behavior (a
          // billing/entitlement wrapper only, relying on the model to separately call
          // completeAutonomousEngineeringTask/endAutonomousEngineeringTask) — never a regression for
          // any existing caller that doesn't yet supply cwd. Deliberately not awaited: this handler's
          // own contract is "return quickly with a runId," matching every other action handler; the
          // orchestration itself runs to completion (or WAITING_FOR_PERMISSION) independently and
          // reports its own outcome via the same billing RPCs a manual completion would have used.
          if (request.cwd) {
            void orchestrateAutonomousRun({
              runId: run.id,
              organizationId,
              ticketSource: request.ticketSource ?? null,
              ticketId: request.ticketId ?? null,
              ticketTitle: request.ticketTitle,
              ticketDescription: request.ticketDescription,
              cwd: request.cwd,
            }).catch((error) => {
              // Never let an orchestration failure become an unhandled rejection — the orchestrator
              // itself already transitions the run to a real terminal/blocked state on every honest
              // failure path; this only guards against a genuinely unexpected exception (e.g. a
              // network error before any state transition ran) so the run doesn't silently stay
              // 'running' forever with no recorded reason.
              void autonomousTaskBillingService.markTerminal(run.id, 'failed').catch(() => undefined);
              // eslint-disable-next-line no-console
              console.error('Autonomous orchestration failed unexpectedly', error);
            });
          }

          // Real, known-today numbers only — the actual per-ticket rate is precomputed from this
          // account's cumulative ticket count (never a complexity guess before the work happens;
          // see TICKET_COMPLEXITY_PRICING's own doc comment for why that stays informational-only
          // until it's wired into the charging RPC itself).
          return {
            ok: true,
            data: { runId: run.id, orchestrated: Boolean(request.cwd), balanceUsd: balance.balanceUsd, currentTicketPriceUsd: nextTicketPrice },
          };
        } catch (error) {
          return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      case 'completeAutonomousEngineeringTask': {
        try {
          // Evidence-based prVerified — genuinely check, via the already-connected GitHub/GitLab
          // connector's real read-only listPullRequests() capability, that the claimed prUrl
          // actually exists before ever reporting prVerified:true. This never blocks completion —
          // an unverifiable PR (wrong host, connector not connected, network failure, no match)
          // simply keeps this completion honestly 'self_reported', exactly as before. ticketVerified
          // stays false unconditionally: no Jira/Linear/GitHub Issues write-back capability exists
          // anywhere in this codebase (both connectors are read-only OAuth scopes today, per the
          // Autonomous Work audit), so there is nothing to genuinely verify a ticket update against
          // — claiming ticketVerified:true here would be exactly the fabricated evidence this system
          // must never produce.
          let prVerified = false;
          if (request.prUrl) {
            const verifyResult = await getIpcBridge().connectivityVerifyPullRequestExists(request.prUrl);
            prVerified = verifyResult.ok && verifyResult.data.verified;
          }
          const eventId = await autonomousTaskBillingService.completeRun(request.runId, {
            prUrl: request.prUrl,
            clientReplySent: request.clientReplySent ?? false,
            deployCompleted: request.deployCompleted ?? false,
            prVerified,
            ticketVerified: false,
          });
          // Read back the real row the RPC just inserted — the exact amount actually deducted,
          // never recomputed client-side — plus the real post-deduction balance. Best-effort: if
          // either read fails, completion itself already succeeded (eventId above proves it), so
          // this only degrades the summary shown, never the real billing outcome.
          let costUsd: number | undefined;
          let newBalanceUsd: number | undefined;
          try {
            const event = await autonomousTaskBillingService.getBillingEventForRun(request.runId);
            if (event) {
              costUsd = event.amountUsd;
              newBalanceUsd = (await autonomousTaskBillingService.getTicketBalance(event.organizationId)).balanceUsd;
            }
          } catch {
            // Summary data only — swallow, the completion above already succeeded.
          }
          return { ok: true, data: { billingEventId: eventId, costUsd, newBalanceUsd } };
        } catch (error) {
          return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      case 'endAutonomousEngineeringTask': {
        try {
          await autonomousTaskBillingService.markTerminal(request.runId, request.status);
          // Real invariant, not a claim: transition_autonomous_task_run() structurally can never
          // reach 'completed' from here, so no billing event was or ever will be created for this
          // run — costUsd: 0 is a fact, not an estimate.
          return { ok: true, data: { costUsd: 0, status: request.status } };
        } catch (error) {
          return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
        }
      }
      default:
        return execute(request);
    }
  };
}

export function connectorDisplayName(connectorId: string): string {
  switch (connectorId) {
    case 'jira':
      return 'Jira';
    case 'linear':
      return 'Linear';
    case 'github':
      return 'GitHub';
    default:
      return connectorId;
  }
}
