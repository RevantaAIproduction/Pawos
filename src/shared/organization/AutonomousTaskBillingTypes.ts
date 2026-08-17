/**
 * Autonomous Engineering Task billing — a dollar-denominated Ticket Balance wallet (see
 * TicketBalance below), not the previous included-monthly-allowance or flat-per-credit models.
 * tracker-agnostic (a run never requires a ticket source), success-gated (billable is only ever
 * set true by the backend's mark_autonomous_task_completed() RPC, which also deducts the current
 * volume-tiered rate — never billed without sufficient balance), and "completed" is defined at
 * PR-ready-and-ticket-updated — never contingent on Paw performing the optional subsequent deploy
 * step.
 *
 * Individual (non-organization) Pro/Pro Max accounts can use this too — organizationId is null for
 * those runs, and a personal ticket balance (see TicketBalance/user_task_credits) is used instead
 * of an organization's.
 */

export type TicketSource = 'jira' | 'github' | 'linear' | 'azureDevOps' | null;
/**
 * The real, persisted autonomous-run lifecycle (see 20260816000000_autonomous_orchestration_state_machine.sql):
 *
 *   queued -> running -> [waiting_for_permission -> running]* -> completed
 *   queued -> running -> failed | cancelled | blocked
 *   running -> blocked -> failed | cancelled
 *   waiting_for_permission -> cancelled | blocked
 *
 * 'queued': the run row exists (deduplicated against any other active run for the same ticket) but
 * orchestration hasn't started calling the execution engine yet.
 * 'waiting_for_permission': a destructive action genuinely required human confirmation (the same
 * DESTRUCTIVE_ACTION_TYPES/self-gated-plugin mechanism every conversation turn already uses) and the
 * run is genuinely paused, not abandoned — see AutonomousOrchestrator.ts.
 * 'blocked': a required capability (most commonly a disconnected/expired connector, or a missing
 * local repository path) is genuinely unavailable — never a fabricated state.
 * 'abandoned' is a system-only terminal state, never settable directly by the client — only
 * reconcile_stale_autonomous_task_runs() can set it, for a run that was started but never resolved
 * by the calling client. It never bills anything.
 *
 * 'completed' is reachable ONLY via mark_autonomous_task_completed() — transition_autonomous_task_run()
 * structurally refuses to ever set it, so a failed/blocked/cancelled run can never become completed.
 */
export type AutonomousTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_permission'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retry_limit_reached'
  | 'abandoned';

/** One row from autonomous_task_run_transitions — the persisted, queryable audit trail of every
 *  state change a run has gone through, independent of its current (latest-only) `status` column. */
export type AutonomousTaskRunTransition = {
  id: string;
  runId: string;
  fromStatus: string;
  toStatus: AutonomousTaskStatus | 'created';
  reason: string | null;
  occurredAt: string;
};

/**
 * Evidence provenance for a completed run — 'self_reported' is the only kind this codebase can
 * currently produce, since no createPullRequest/updateTicket connector capability exists yet (a
 * completion is asserted by whichever agent calls complete_autonomous_engineering_task, with no
 * independent check). 'connector_verified' is reserved for a future real GitHub/GitLab
 * PR-creation and Jira/Linear/GitHub Issues ticket-write capability that can confirm the write
 * actually happened — the billing RPC already accepts and records this distinction (see
 * 20260727010000_billing_completion_provenance.sql) so that capability, once built, needs no
 * changes to the billing pipeline itself, only to call the same completion path with verified
 * evidence. Only first-party connector code may ever claim 'connector_verified' — it is never a
 * model-settable tool argument.
 */
export type CompletionSource = 'self_reported' | 'connector_verified';

export type AutonomousTaskRun = {
  id: string;
  /** Null for an individual (non-organization) Pro/Pro Max run. */
  organizationId: string | null;
  workspaceId: string | null;
  userId: string;
  ticketSource: TicketSource;
  ticketId: string | null;
  repository: string | null;
  runtimeVersion: string;
  status: AutonomousTaskStatus;
  prCreated: boolean;
  prUrl: string | null;
  /** True only if a connector independently confirmed the PR exists — never set by a self-report. */
  prVerified: boolean;
  ticketUpdated: boolean;
  /** True only if a connector independently confirmed the ticket write — never set by a self-report. */
  ticketVerified: boolean;
  clientReplySent: boolean;
  deployCompleted: boolean;
  billable: boolean;
  completionSource: CompletionSource;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

export type OrganizationBillingEvent = {
  id: string;
  runId: string;
  /** Null for an individual (non-organization) Pro/Pro Max run. */
  organizationId: string | null;
  workspaceId: string | null;
  userId: string;
  ticketId: string | null;
  runtimeVersion: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  status: string;
  eventType: 'autonomous_engineering_task';
  amountUsd: number;
  invoiceReference: string | null;
  completionSource: CompletionSource;
  createdAt: string;
};

/** Deprecated — replaced completely by the Ticket Balance wallet below. No application code writes to organization_task_allowance anymore; the type is kept only so old persisted references don't dangle. */
export type OrganizationTaskAllowance = {
  id: string;
  organizationId: string;
  periodMonth: string;
  includedAllowance: number;
  usedCount: number;
  updatedAt: string;
};

/**
 * Ticket balance is a dollar-denominated wallet, completely independent of subscription billing
 * (Go/Pro/Pro Max/Team/Enterprise pricing lives in PricingConfigStore.ts and is never touched by
 * this file). A user tops up any dollar amount (a few presets are offered, but any amount at or
 * above the minimum is accepted); every completed ticket then deducts the *current* per-ticket
 * rate from that balance. The rate is volume-tiered by the account's cumulative ticket count —
 * not by how much was topped up — so the same $100 balance can buy a different number of tickets
 * depending on how many tickets this account has already run. Mirrored manually in
 * pawos-web/src/lib/billing/razorpay.ts and in the get_ticket_unit_price() SQL function (kept in
 * sync by hand since pawos-web is a separate deployment with no shared build step).
 */
export interface TicketPricingTier {
  minTicketNumber: number;
  /** null = open-ended (25,000+). */
  maxTicketNumber: number | null;
  pricePerTicketUsd: number;
}

export const TICKET_PRICING_TIERS: readonly TicketPricingTier[] = [
  { minTicketNumber: 1, maxTicketNumber: 500, pricePerTicketUsd: 5.0 },
  { minTicketNumber: 501, maxTicketNumber: 2000, pricePerTicketUsd: 4.5 },
  { minTicketNumber: 2001, maxTicketNumber: 10000, pricePerTicketUsd: 4.0 },
  { minTicketNumber: 10001, maxTicketNumber: 25000, pricePerTicketUsd: 3.5 },
  { minTicketNumber: 25001, maxTicketNumber: null, pricePerTicketUsd: 3.0 },
];

/** The rate that applies to the Nth ticket this account completes (1-indexed) — e.g. the 501st
 *  ticket (this account's 501st ever) is priced at the 501-2,000 tier's rate. */
export function getTicketUnitPriceUsd(ticketNumber: number): number {
  const tier = TICKET_PRICING_TIERS.find((t) => ticketNumber >= t.minTicketNumber && (t.maxTicketNumber === null || ticketNumber <= t.maxTicketNumber));
  // TICKET_PRICING_TIERS[0] is a fixed literal (never empty), but noUncheckedIndexedAccess still
  // types the fallback as possibly undefined — the explicit fallback price keeps this honest
  // without an unsound non-null assertion.
  return tier?.pricePerTicketUsd ?? 5.0;
}

/** Real, finalized minimum top-up: a balance top-up must be at least $30. */
export const MIN_TICKET_BALANCE_TOPUP_USD = 30;
/** Preset top-up amounts shown in the UI — not exhaustive, a custom amount at or above the minimum is always accepted. */
export const TICKET_BALANCE_TOPUP_PRESETS_USD: readonly number[] = [30, 60, 100, 150, 200];

/** A ticket balance wallet — either an individual's own (organizationId: null) or an organization's. */
export type TicketBalance = {
  organizationId: string | null;
  balanceUsd: number;
  /** Cumulative completed tickets ever billed against this balance — determines the rate the *next* ticket is charged at. */
  ticketsUsedCount: number;
  updatedAt: string;
};

export type TicketBalanceTopup = {
  id: string;
  userId: string | null;
  organizationId: string | null;
  amountUsd: number;
  paymentReference: string | null;
  toppedUpAt: string;
};

/**
 * Real, evidence-based verdict for one check the orchestrator either did or didn't get to run.
 * Deliberately a closed vocabulary (never a free-form string) so a caller can never invent a sixth
 * meaning — see AutonomousOrchestrator.ts's own doc comment for the exact definition of each:
 * CAPTURED (ran, evidence exists), NOT_CAPTURED (ran, but no evidence was recorded for it),
 * NOT_EXECUTED (never attempted), FAILED (ran and failed), BLOCKED (a required capability was
 * genuinely unavailable).
 */
export type AutonomousEvidenceStatus = 'CAPTURED' | 'NOT_CAPTURED' | 'NOT_EXECUTED' | 'FAILED' | 'BLOCKED';

export type AutonomousEvidenceCheck = {
  label: string;
  status: AutonomousEvidenceStatus;
  detail: string;
};

/**
 * The real, execution-linked evidence an orchestrated run produced — every field here is derived
 * directly from a real ExecutionRecord (see ExecutionRecordTypes.ts) or a real connector call
 * result, never from the model's own final-turn narration text. `executionRecordId` is the one
 * genuine cross-system link between a Supabase autonomous_task_runs row and the Electron app's own
 * local Work History/ExecutionRecord store (see ExecutionRecordTypes.ts's new `externalRunId` field,
 * which carries this run's id in the opposite direction).
 */
export type AutonomousExecutionEvidence = {
  executionRecordId: string | null;
  commandsExecuted: number;
  filesChanged: number;
  checks: AutonomousEvidenceCheck[];
};

/**
 * The orchestrator's own final, evidence-derived verdict — 'success' is the ONLY outcome that may
 * ever lead to calling mark_autonomous_task_completed(); every other outcome routes to
 * transition_autonomous_task_run()/mark_autonomous_task_terminal() instead, and none of them are
 * ever billed. Never derived from the model's own claim of success — see
 * deriveOutcomeFromExecutionRecord() in AutonomousOrchestrator.ts.
 */
export type AutonomousOutcomeKind = 'success' | 'failed' | 'blocked' | 'cancelled';

export type AutonomousOutcome = {
  kind: AutonomousOutcomeKind;
  reason: string;
  evidence: AutonomousExecutionEvidence;
};
