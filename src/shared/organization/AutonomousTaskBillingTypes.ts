/**
 * Autonomous Engineering Task billing — prepaid credits, not the previous
 * included-monthly-allowance model. tracker-agnostic (a run never requires
 * a ticket source), success-gated (billable is only ever set true by the
 * backend's mark_autonomous_task_completed() RPC, which also deducts
 * exactly 1 prepaid credit — never billed without one), and "completed" is
 * defined at PR-ready-and-ticket-updated — never contingent on Paw
 * performing the optional subsequent deploy step.
 *
 * Individual (non-organization) Pro/Pro Max accounts can use this too —
 * organizationId is null for those runs, and a personal credit balance
 * (see TaskCreditBalance/user_task_credits) is used instead of an
 * organization's.
 */

export type TicketSource = 'jira' | 'github' | 'linear' | 'azureDevOps' | null;
export type AutonomousTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'retry_limit_reached';

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
  ticketUpdated: boolean;
  clientReplySent: boolean;
  deployCompleted: boolean;
  billable: boolean;
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
  createdAt: string;
};

/** Deprecated — replaced completely by the prepaid credit model below. No application code writes to organization_task_allowance anymore; the type is kept only so old persisted references don't dangle. */
export type OrganizationTaskAllowance = {
  id: string;
  organizationId: string;
  periodMonth: string;
  includedAllowance: number;
  usedCount: number;
  updatedAt: string;
};

/** Real, finalized price: $5 per Autonomous Engineering Task credit. Never hardcode this elsewhere; every call site reads it from here. */
export const AUTONOMOUS_TASK_PRICE_USD = 5;
/** Real, finalized minimum: the first (and every) credit purchase must be at least 6 credits ($30). */
export const MIN_TASK_CREDIT_PURCHASE = 6;

/** A prepaid credit balance — either an individual's own (organizationId: null) or an organization's. */
export type TaskCreditBalance = {
  organizationId: string | null;
  balance: number;
  updatedAt: string;
};

export type TaskCreditPurchase = {
  id: string;
  userId: string | null;
  organizationId: string | null;
  credits: number;
  amountUsd: number;
  paymentReference: string | null;
  purchasedAt: string;
};
