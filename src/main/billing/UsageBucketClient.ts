import { callRpcAsUser } from '../auth/ServerSessionToken';
import {
  EMPTY_USAGE_SUMMARY,
  toCustomerUsageHistory,
  toCustomerUsageSummary,
  usageLimitMessage,
  type CustomerUsageHistoryEntry,
  type CustomerUsageSummary,
  type ModelCallReservation,
  type ModelCallReservationRequest,
  type ModelCallUsage,
  type UsageLimitReason,
} from '../../shared/billing/UsageBucketTypes';

/** 'standard' = plan → mid-month → credits; 'credits_only' = Paw Fable, or Go/Build past their free allowance. */
export type ReservationScope = 'standard' | 'credits_only';

type RpcCaller = <T = unknown>(name: string, args: Record<string, unknown>) => Promise<T>;

const SETTLE_RETRY_DELAYS_MS = [2_000, 10_000, 30_000, 120_000];

/**
 * The desktop side of the server-authoritative usage buckets (supabase/migrations/
 * 20261001000000_usage_buckets.sql). Every paid Gemini call goes reserve → call → settle (or release)
 * through here, as the signed-in user. The server alone picks the bucket, prices the call and
 * charges it; this client never computes or sends an amount.
 *
 * Fails closed: if a reservation can't be confirmed, the call is refused. A settlement that can't be
 * delivered is retried; if it never arrives, the server charges the full reservation after 10 minutes
 * (never less), so a lost settlement can't make usage free.
 *
 * Only the customer-safe summary (UsageBucketTypes.ts) is cached and handed to the renderer.
 */
export class UsageBucketClient {
  private summary: CustomerUsageSummary | null = null;
  private listeners = new Set<(summary: CustomerUsageSummary) => void>();

  constructor(private readonly rpc: RpcCaller = callRpcAsUser) {}

  getCachedSummary(): CustomerUsageSummary | null {
    return this.summary;
  }

  onSummaryChanged(listener: (summary: CustomerUsageSummary) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.summary = null;
  }

  private applySummary(raw: unknown): void {
    if (!raw) return;
    this.summary = toCustomerUsageSummary(raw);
    for (const listener of this.listeners) {
      try {
        listener(this.summary);
      } catch {
        // a listener must never break billing
      }
    }
  }

  async refreshSummary(): Promise<CustomerUsageSummary | null> {
    try {
      this.applySummary(await this.rpc('get_my_usage_summary', {}));
    } catch (error) {
      console.warn('[UsageBuckets] Summary refresh failed:', error instanceof Error ? error.message : error);
    }
    return this.summary;
  }

  async getHistory(limit = 100): Promise<CustomerUsageHistoryEntry[]> {
    try {
      return toCustomerUsageHistory(await this.rpc('get_my_usage_history', { p_limit: limit }));
    } catch {
      return [];
    }
  }

  async reserve(request: ModelCallReservationRequest, scope: ReservationScope): Promise<ModelCallReservation> {
    let raw: Record<string, unknown> | null;
    try {
      raw = await this.rpc<Record<string, unknown>>('reserve_usage', {
        p_request_key: request.requestKey,
        p_model: request.model,
        p_input_tokens: Math.max(0, Math.ceil(request.inputTokens)),
        p_input_is_upper_bound: request.inputIsUpperBound,
        // The server clamps this to its configured engine maximum; null = use that maximum.
        p_max_output_tokens: typeof request.maxOutputTokens === 'number' && request.maxOutputTokens > 0 ? Math.floor(request.maxOutputTokens) : null,
        p_category: request.category ?? 'chat',
        p_scope: scope,
      });
    } catch (error) {
      console.warn('[UsageBuckets] Reservation failed — refusing the call:', error instanceof Error ? error.message : error);
      return { ok: false, reason: 'service_unavailable', message: usageLimitMessage('service_unavailable') };
    }
    this.applySummary(raw?.summary);
    if (raw?.ok === true && typeof raw.reservationId === 'string' && typeof raw.maxOutputTokens === 'number') {
      return { ok: true, reservationId: raw.reservationId, maxOutputTokens: raw.maxOutputTokens };
    }
    const reason: UsageLimitReason =
      raw?.reason === 'plan_weekly_paced' || raw?.reason === 'no_allowance' || raw?.reason === 'plan_exhausted' ? raw.reason : 'service_unavailable';
    // A plan that can no longer fund the call reads as "plan exhausted" when the customer has a plan.
    const effective: UsageLimitReason = reason === 'no_allowance' && this.summary?.limitReason === 'plan_exhausted' ? 'plan_exhausted' : reason;
    return { ok: false, reason: effective, message: usageLimitMessage(effective, this.summary?.limitResetsAt ?? null) };
  }

  /** Settles with the provider-reported usage. Retried in the background if the server can't be reached. */
  async settle(reservationId: string, usageEventId: string, usage: ModelCallUsage): Promise<void> {
    const args = {
      p_reservation_id: reservationId,
      p_usage_event_id: usageEventId,
      p_prompt_tokens: Math.max(0, Math.round(usage.promptTokens)),
      p_candidates_tokens: Math.max(0, Math.round(usage.candidatesTokens)),
      p_cached_tokens: Math.max(0, Math.round(usage.cachedTokens)),
      p_thoughts_tokens: Math.max(0, Math.round(usage.thoughtsTokens)),
    };
    await this.callWithRetry('settle_usage', args);
  }

  /** Releases a reservation whose call produced no billable usage. */
  async release(reservationId: string): Promise<void> {
    await this.callWithRetry('release_usage_reservation', { p_reservation_id: reservationId });
  }

  private async callWithRetry(name: string, args: Record<string, unknown>, attempt = 0): Promise<void> {
    try {
      const raw = await this.rpc<Record<string, unknown>>(name, args);
      this.applySummary(raw?.summary);
    } catch (error) {
      const delay = SETTLE_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        // The server settles an abandoned reservation at its full amount after 10 minutes.
        console.warn(`[UsageBuckets] ${name} gave up after retries; the server will close the reservation:`, error instanceof Error ? error.message : error);
        return;
      }
      setTimeout(() => void this.callWithRetry(name, args, attempt + 1), delay).unref?.();
    }
  }
}

export const usageBucketClient = new UsageBucketClient();
export { EMPTY_USAGE_SUMMARY };
