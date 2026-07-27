import { getSupabaseClient } from '../auth/supabaseClient';
import type {
  AutonomousTaskRun,
  AutonomousTaskStatus,
  CompletionSource,
  OrganizationBillingEvent,
  TicketBalance,
  TicketBalanceTopup,
  TicketSource,
} from '../../shared/organization/AutonomousTaskBillingTypes';

type RunRow = {
  id: string; organization_id: string | null; workspace_id: string | null; user_id: string;
  ticket_source: TicketSource; ticket_id: string | null; repository: string | null;
  runtime_version: string; status: AutonomousTaskStatus; pr_created: boolean; pr_url: string | null;
  pr_verified: boolean; ticket_updated: boolean; ticket_verified: boolean; client_reply_sent: boolean;
  deploy_completed: boolean; billable: boolean; completion_source: CompletionSource;
  started_at: string; completed_at: string | null; created_at: string;
};

type BillingEventRow = {
  id: string; run_id: string; organization_id: string | null; workspace_id: string | null; user_id: string;
  ticket_id: string | null; runtime_version: string; started_at: string; completed_at: string;
  duration_seconds: number; status: string; event_type: 'autonomous_engineering_task';
  amount_usd: number; invoice_reference: string | null; completion_source: CompletionSource; created_at: string;
};

type BalanceRow = { organization_id: string | null; balance_usd: number; tickets_used_count: number; updated_at: string };
type TopupRow = {
  id: string; user_id: string | null; organization_id: string | null;
  amount_usd: number; payment_reference: string | null; topped_up_at: string;
};

function toRun(row: RunRow): AutonomousTaskRun {
  return {
    id: row.id, organizationId: row.organization_id, workspaceId: row.workspace_id, userId: row.user_id,
    ticketSource: row.ticket_source, ticketId: row.ticket_id, repository: row.repository,
    runtimeVersion: row.runtime_version, status: row.status, prCreated: row.pr_created, prUrl: row.pr_url,
    prVerified: row.pr_verified, ticketUpdated: row.ticket_updated, ticketVerified: row.ticket_verified,
    clientReplySent: row.client_reply_sent, deployCompleted: row.deploy_completed,
    billable: row.billable, completionSource: row.completion_source,
    startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at,
  };
}

function toBillingEvent(row: BillingEventRow): OrganizationBillingEvent {
  return {
    id: row.id, runId: row.run_id, organizationId: row.organization_id, workspaceId: row.workspace_id, userId: row.user_id,
    ticketId: row.ticket_id, runtimeVersion: row.runtime_version, startedAt: row.started_at, completedAt: row.completed_at,
    durationSeconds: row.duration_seconds, status: row.status, eventType: row.event_type, amountUsd: row.amount_usd,
    invoiceReference: row.invoice_reference, completionSource: row.completion_source, createdAt: row.created_at,
  };
}

function toTopup(row: TopupRow): TicketBalanceTopup {
  return {
    id: row.id, userId: row.user_id, organizationId: row.organization_id,
    amountUsd: row.amount_usd, paymentReference: row.payment_reference, toppedUpAt: row.topped_up_at,
  };
}

/**
 * Renderer-side driver for Autonomous Engineering Task billing — direct-
 * Supabase pattern matching every other org service. This service only
 * ever *reports* a run's lifecycle to the backend; the backend's own
 * mark_autonomous_task_completed()/mark_autonomous_task_terminal() RPCs are
 * the sole source of truth for whether a run is billable and for deducting
 * the current volume-tiered rate from the Ticket Balance (see the
 * migration's own comments) — this class cannot itself set `billable` or
 * grant balance. `organizationId: null` scopes a
 * run to the calling individual (Pro/Pro Max) account instead of an
 * organization.
 */
export const autonomousTaskBillingService = {
  async startRun(organizationId: string | null, opts: { workspaceId?: string; ticketSource?: TicketSource; ticketId?: string; repository?: string; runtimeVersion: string }): Promise<AutonomousTaskRun> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('autonomous_task_runs')
      .insert({
        organization_id: organizationId,
        workspace_id: opts.workspaceId ?? null,
        user_id: userId,
        ticket_source: opts.ticketSource ?? null,
        ticket_id: opts.ticketId ?? null,
        repository: opts.repository ?? null,
        runtime_version: opts.runtimeVersion,
      })
      .select('*')
      .single<RunRow>();
    if (error) throw error;
    return toRun(data);
  },

  /** Fires only when the execution engine's own internal state reaches
   * COMPLETED — never called speculatively or on the user's say-so. Deducts
   * this account's *current* per-ticket rate (server-computed from its own
   * cumulative ticket count — never supplied by the caller) from its ticket
   * balance; raises if the balance can't cover that rate.
   *
   * `prVerified`/`ticketVerified` default to false — today, every caller of this method is the
   * model-facing AutonomousTaskBillingGate.ts path, which can only ever self-report completion (no
   * createPullRequest/updateTicket connector capability exists to check independently — see
   * 20260727010000_billing_completion_provenance.sql). These two flags exist so that a FUTURE real
   * connector capability can call this exact same method with verified evidence, tagging the
   * resulting billing event 'connector_verified' — without any change to the billing math itself.
   * Never wire a model tool argument directly into these flags; only genuine first-party connector
   * code that has actually confirmed the write may set them true. */
  async completeRun(runId: string, opts: { prUrl?: string; clientReplySent: boolean; deployCompleted: boolean; invoiceReference?: string; prVerified?: boolean; ticketVerified?: boolean }): Promise<string> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('mark_autonomous_task_completed', {
      p_run_id: runId,
      p_pr_url: opts.prUrl ?? null,
      p_client_reply_sent: opts.clientReplySent,
      p_deploy_completed: opts.deployCompleted,
      p_invoice_reference: opts.invoiceReference ?? null,
      p_pr_verified: opts.prVerified ?? false,
      p_ticket_verified: opts.ticketVerified ?? false,
    });
    if (error) throw error;
    return data as string;
  },

  async markTerminal(runId: string, status: 'failed' | 'cancelled' | 'retry_limit_reached'): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('mark_autonomous_task_terminal', { p_run_id: runId, p_status: status });
    if (error) throw error;
  },

  /**
   * Deterministic, server-side safety net for runs the calling client (including the model itself)
   * never resolved — see reconcile_stale_autonomous_task_runs()'s own comment for why this never
   * bills anything. Called unconditionally once per app session (Dashboard.tsx's own init effect),
   * never gated behind any model tool call, so a run's true fate is always eventually recorded even
   * if completeRun()/markTerminal() are never invoked for it. Returns the number of runs reconciled.
   */
  async reconcileStaleRuns(staleAfterHours = 24): Promise<number> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('reconcile_stale_autonomous_task_runs', { p_stale_after_hours: staleAfterHours });
    if (error) throw error;
    return data as number;
  },

  async listRecentRuns(organizationId: string | null, limit = 50): Promise<AutonomousTaskRun[]> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('autonomous_task_runs').select('*');
    query = organizationId ? query.eq('organization_id', organizationId) : query.is('organization_id', null);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit).returns<RunRow[]>();
    if (error) throw error;
    return (data ?? []).map(toRun);
  },

  async listBillingHistory(organizationId: string | null, limit = 100): Promise<OrganizationBillingEvent[]> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('organization_billing_events').select('*');
    query = organizationId ? query.eq('organization_id', organizationId) : query.is('organization_id', null);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit).returns<BillingEventRow[]>();
    if (error) throw error;
    return (data ?? []).map(toBillingEvent);
  },

  /** Real ticket balance wallet — reads user_task_credits when organizationId is null, organization_task_credits otherwise. */
  async getTicketBalance(organizationId: string | null): Promise<TicketBalance> {
    const supabase = await getSupabaseClient();
    if (organizationId) {
      const { data, error } = await supabase
        .from('organization_task_credits')
        .select('organization_id, balance_usd, tickets_used_count, updated_at')
        .eq('organization_id', organizationId)
        .maybeSingle<BalanceRow>();
      if (error) throw error;
      return { organizationId, balanceUsd: data?.balance_usd ?? 0, ticketsUsedCount: data?.tickets_used_count ?? 0, updatedAt: data?.updated_at ?? new Date(0).toISOString() };
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('user_task_credits')
      .select('balance_usd, tickets_used_count, updated_at')
      .eq('user_id', userId)
      .maybeSingle<{ balance_usd: number; tickets_used_count: number; updated_at: string }>();
    if (error) throw error;
    return { organizationId: null, balanceUsd: data?.balance_usd ?? 0, ticketsUsedCount: data?.tickets_used_count ?? 0, updatedAt: data?.updated_at ?? new Date(0).toISOString() };
  },

  async listTopups(organizationId: string | null, limit = 100): Promise<TicketBalanceTopup[]> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('ticket_balance_topups').select('*');
    query = organizationId ? query.eq('organization_id', organizationId) : query.is('organization_id', null);
    const { data, error } = await query.order('topped_up_at', { ascending: false }).limit(limit).returns<TopupRow[]>();
    if (error) throw error;
    return (data ?? []).map(toTopup);
  },

  /** Called after a real, verified Razorpay top-up completes — see CheckoutSyncServer.ts. Adds
   *  funds via the security-definer add_ticket_balance() RPC; never settable to an arbitrary
   *  amount by this class alone (the RPC still runs under the purchaser's own auth session, same
   *  trust model as SubscriptionStore.confirmPurchase). */
  async topUpBalance(organizationId: string | null, amountUsd: number, paymentReference?: string): Promise<string> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('add_ticket_balance', {
      p_organization_id: organizationId,
      p_amount_usd: amountUsd,
      p_payment_reference: paymentReference ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /** Month-to-date total spend, computed client-side from the billing history
   * this session already fetched — no separate aggregate RPC needed for a
   * single month's worth of rows. */
  monthToDateTotal(events: OrganizationBillingEvent[]): number {
    const now = new Date();
    return events
      .filter((e) => {
        const d = new Date(e.createdAt);
        return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
      })
      .reduce((sum, e) => sum + e.amountUsd, 0);
  },
};
