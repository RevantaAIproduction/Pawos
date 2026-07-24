import { getSupabaseClient } from '../auth/supabaseClient';
import type {
  AutonomousTaskRun,
  AutonomousTaskStatus,
  OrganizationBillingEvent,
  TaskCreditBalance,
  TaskCreditPurchase,
  TicketSource,
} from '../../shared/organization/AutonomousTaskBillingTypes';
import { AUTONOMOUS_TASK_PRICE_USD } from '../../shared/organization/AutonomousTaskBillingTypes';

type RunRow = {
  id: string; organization_id: string | null; workspace_id: string | null; user_id: string;
  ticket_source: TicketSource; ticket_id: string | null; repository: string | null;
  runtime_version: string; status: AutonomousTaskStatus; pr_created: boolean; pr_url: string | null;
  ticket_updated: boolean; client_reply_sent: boolean; deploy_completed: boolean; billable: boolean;
  started_at: string; completed_at: string | null; created_at: string;
};

type BillingEventRow = {
  id: string; run_id: string; organization_id: string | null; workspace_id: string | null; user_id: string;
  ticket_id: string | null; runtime_version: string; started_at: string; completed_at: string;
  duration_seconds: number; status: string; event_type: 'autonomous_engineering_task';
  amount_usd: number; invoice_reference: string | null; created_at: string;
};

type CreditBalanceRow = { organization_id: string | null; balance: number; updated_at: string };
type PurchaseRow = {
  id: string; user_id: string | null; organization_id: string | null; credits: number;
  amount_usd: number; payment_reference: string | null; purchased_at: string;
};

function toRun(row: RunRow): AutonomousTaskRun {
  return {
    id: row.id, organizationId: row.organization_id, workspaceId: row.workspace_id, userId: row.user_id,
    ticketSource: row.ticket_source, ticketId: row.ticket_id, repository: row.repository,
    runtimeVersion: row.runtime_version, status: row.status, prCreated: row.pr_created, prUrl: row.pr_url,
    ticketUpdated: row.ticket_updated, clientReplySent: row.client_reply_sent, deployCompleted: row.deploy_completed,
    billable: row.billable, startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at,
  };
}

function toBillingEvent(row: BillingEventRow): OrganizationBillingEvent {
  return {
    id: row.id, runId: row.run_id, organizationId: row.organization_id, workspaceId: row.workspace_id, userId: row.user_id,
    ticketId: row.ticket_id, runtimeVersion: row.runtime_version, startedAt: row.started_at, completedAt: row.completed_at,
    durationSeconds: row.duration_seconds, status: row.status, eventType: row.event_type, amountUsd: row.amount_usd,
    invoiceReference: row.invoice_reference, createdAt: row.created_at,
  };
}

function toPurchase(row: PurchaseRow): TaskCreditPurchase {
  return {
    id: row.id, userId: row.user_id, organizationId: row.organization_id, credits: row.credits,
    amountUsd: row.amount_usd, paymentReference: row.payment_reference, purchasedAt: row.purchased_at,
  };
}

/**
 * Renderer-side driver for Autonomous Engineering Task billing — direct-
 * Supabase pattern matching every other org service. This service only
 * ever *reports* a run's lifecycle to the backend; the backend's own
 * mark_autonomous_task_completed()/mark_autonomous_task_terminal() RPCs are
 * the sole source of truth for whether a run is billable and for deducting
 * a prepaid credit (see the migration's own comments) — this class cannot
 * itself set `billable` or grant credits. `organizationId: null` scopes a
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
   * exactly 1 prepaid credit server-side; raises if the balance is 0. */
  async completeRun(runId: string, opts: { prUrl?: string; clientReplySent: boolean; deployCompleted: boolean; invoiceReference?: string }): Promise<string> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('mark_autonomous_task_completed', {
      p_run_id: runId,
      p_pr_url: opts.prUrl ?? null,
      p_client_reply_sent: opts.clientReplySent,
      p_deploy_completed: opts.deployCompleted,
      p_amount_usd: AUTONOMOUS_TASK_PRICE_USD,
      p_invoice_reference: opts.invoiceReference ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async markTerminal(runId: string, status: 'failed' | 'cancelled' | 'retry_limit_reached'): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('mark_autonomous_task_terminal', { p_run_id: runId, p_status: status });
    if (error) throw error;
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

  /** Real prepaid balance — reads user_task_credits when organizationId is null, organization_task_credits otherwise. */
  async getCreditBalance(organizationId: string | null): Promise<TaskCreditBalance> {
    const supabase = await getSupabaseClient();
    if (organizationId) {
      const { data, error } = await supabase
        .from('organization_task_credits')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle<CreditBalanceRow>();
      if (error) throw error;
      return { organizationId, balance: data?.balance ?? 0, updatedAt: data?.updated_at ?? new Date(0).toISOString() };
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('user_task_credits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<{ user_id: string; balance: number; updated_at: string }>();
    if (error) throw error;
    return { organizationId: null, balance: data?.balance ?? 0, updatedAt: data?.updated_at ?? new Date(0).toISOString() };
  },

  async listCreditPurchases(organizationId: string | null, limit = 100): Promise<TaskCreditPurchase[]> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('task_credit_purchases').select('*');
    query = organizationId ? query.eq('organization_id', organizationId) : query.is('organization_id', null);
    const { data, error } = await query.order('purchased_at', { ascending: false }).limit(limit).returns<PurchaseRow[]>();
    if (error) throw error;
    return (data ?? []).map(toPurchase);
  },

  /** Called after a real, verified Razorpay purchase completes — see CheckoutSyncServer.ts. Adds credits via the security-definer add_task_credits() RPC; never settable to an arbitrary amount by this class alone (the RPC still runs under the purchaser's own auth session, same trust model as SubscriptionStore.confirmPurchase). */
  async confirmCreditPurchase(organizationId: string | null, credits: number, amountUsd: number, paymentReference?: string): Promise<string> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('add_task_credits', {
      p_organization_id: organizationId,
      p_credits: credits,
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
