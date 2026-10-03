/**
 * Customer-safe usage bucket data — the ONLY shape of paid-usage information that reaches the
 * renderer. The server (get_my_usage_summary / reserve_usage / settle_usage) keeps every private
 * value (provider cost, private allowance, reservations, prices, token counts) to itself; this module
 * whitelists the customer fields once more on the way in, so nothing else can leak through IPC even
 * if the server response ever gained a field.
 *
 * Customer rule: $1 of customer value = 100 PC.
 */

export type UsageBucketType = 'monthly_plan' | 'mid_month_purchase' | 'purchased_credits';
export type UsageBucketStatus = 'active' | 'exhausted' | 'expired' | 'revoked';
export type UsageLimitReason = 'plan_weekly_paced' | 'plan_exhausted' | 'no_allowance' | 'service_unavailable';

export type CustomerUsageBucket = {
  id: string;
  type: UsageBucketType;
  label: string;
  amountPaidCents: number;
  pcTotal: number;
  pcUsed: number;
  pcRemaining: number;
  percentUsed: number;
  status: UsageBucketStatus;
  startsAt: string | null;
  expiresAt: string | null;
  resetsAt: string | null;
  /** Product configuration key (e.g. 'pro_monthly'); any future product key passes through. */
  productKey: string | null;
};

export type CustomerWeeklyPacing = {
  percentUsed: number;
  reached: boolean;
  resetsAt: string | null;
  pcLimit: number;
};

export type CustomerUsageSummary = {
  /** The current plan product (generic key + customer-facing label), or null. */
  plan: { productKey: string; label: string } | null;
  /** True while a current plan bucket funds this account — the server's product configuration decides. */
  bucketFunded: boolean;
  buckets: CustomerUsageBucket[];
  weeklyPacing: CustomerWeeklyPacing | null;
  creditsPcRemaining: number;
  limitReached: boolean;
  limitReason: UsageLimitReason | null;
  limitResetsAt: string | null;
};

export type CustomerUsageHistoryEntry = {
  at: string;
  category: string;
  bucketType: UsageBucketType;
  pc: number;
};

/** What a Gemini call site asks before calling Gemini. Token counts go to main/the server only. */
export type ModelCallReservationRequest = {
  /** Unique per real Gemini request — the provider's own requestId. */
  requestKey: string;
  model: string;
  /** countTokens on the exact request, or a UTF-8 byte upper bound when countTokens failed. */
  inputTokens: number;
  inputIsUpperBound: boolean;
  /** The call's own output ceiling; omitted = the server's configured maximum. */
  maxOutputTokens?: number;
  category?: string;
  pawModelId?: string;
};

/**
 * The answer: either go ahead — with exactly `maxOutputTokens` when it is set (null = no reservation
 * is involved: free allowance or pooled usage; keep the call's own limit) — or a customer-facing denial.
 */
export type ModelCallReservation =
  | { ok: true; reservationId: string | null; maxOutputTokens: number | null }
  | { ok: false; reason: UsageLimitReason; message: string };

export type ModelCallUsage = {
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
};

/** Credits purchase UI configuration, served by pawos-web (customer-facing values only). */
export type UsageCreditsPurchaseConfig =
  | { ok: true; topupPresetsUsd: number[]; minTopupUsd: number; maxTopupUsd: number; usdInrRate: number; pcPerUsd: number }
  | { ok: false; reason: string };

/** What billing:recordTurnUsage returns: the local history balance only (no provider-level data). */
export type RecordedTurnUsage = { balance: import('./BillingTypes').CreditBalance };

/** What billing:reportUsageEvent returns: an acknowledgement only. */
export type UsageEventAck = { ok: true };

/** What billing:getUsageEvents returns: when, what kind, which session — no model, tokens or compute. */
export type LocalUsageEventSummary = { usageEventId: string; timestamp: number; requestType: string; sessionId: string | null };

/** Mid-month purchase (extra usage until the current plan period ends) — customer-facing values only. */
export type MidMonthOfferResult =
  | { ok: true; available: true; label: string; amountUsd: number; amountInr: number | null; pc: number; expiresAt: string }
  | { ok: true; available: false; reason?: string }
  | { ok: false; reason: string };

export type MidMonthCheckoutResult =
  | {
      ok: true;
      keyId: string;
      orderId: string;
      amountUsd: number;
      amountInr: number;
      amountPaise: number;
      usdInrRate: number;
      currency: 'INR';
      label: string;
      pc: number;
      expiresAt: string;
    }
  | { ok: false; reason: string };

export type MidMonthVerificationResult = { ok: true; pc: number; expiresAt: string | null } | { ok: false; reason: string };

const BUCKET_TYPES: UsageBucketType[] = ['monthly_plan', 'mid_month_purchase', 'purchased_credits'];
const BUCKET_STATUSES: UsageBucketStatus[] = ['active', 'exhausted', 'expired', 'revoked'];
const LIMIT_REASONS: UsageLimitReason[] = ['plan_weekly_paced', 'plan_exhausted', 'no_allowance', 'service_unavailable'];

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;

export const EMPTY_USAGE_SUMMARY: CustomerUsageSummary = {
  plan: null,
  bucketFunded: false,
  buckets: [],
  weeklyPacing: null,
  creditsPcRemaining: 0,
  limitReached: false,
  limitReason: null,
  limitResetsAt: null,
};

/** Keeps only the customer-facing fields of a server summary (defense in depth). */
export function toCustomerUsageSummary(raw: unknown): CustomerUsageSummary {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_USAGE_SUMMARY };
  const r = raw as Record<string, unknown>;
  const planRaw = r.plan && typeof r.plan === 'object' ? (r.plan as Record<string, unknown>) : null;
  const planKey = str(planRaw?.productKey);
  const pacingRaw = r.weeklyPacing && typeof r.weeklyPacing === 'object' ? (r.weeklyPacing as Record<string, unknown>) : null;
  const buckets = Array.isArray(r.buckets) ? r.buckets : [];
  return {
    plan: planKey ? { productKey: planKey, label: str(planRaw?.label) ?? '' } : null,
    bucketFunded: r.bucketFunded === true,
    buckets: buckets.flatMap((item): CustomerUsageBucket[] => {
      if (!item || typeof item !== 'object') return [];
      const b = item as Record<string, unknown>;
      const type = pick(b.type, BUCKET_TYPES);
      const status = pick(b.status, BUCKET_STATUSES);
      const id = str(b.id);
      if (!type || !status || !id) return [];
      return [{
        id,
        type,
        label: str(b.label) ?? '',
        amountPaidCents: num(b.amountPaidCents),
        pcTotal: num(b.pcTotal),
        pcUsed: num(b.pcUsed),
        pcRemaining: num(b.pcRemaining),
        percentUsed: Math.min(100, Math.max(0, num(b.percentUsed))),
        status,
        startsAt: str(b.startsAt),
        expiresAt: str(b.expiresAt),
        resetsAt: str(b.resetsAt),
        productKey: str(b.productKey),
      }];
    }),
    weeklyPacing: pacingRaw
      ? {
          percentUsed: Math.min(100, Math.max(0, num(pacingRaw.percentUsed))),
          reached: pacingRaw.reached === true,
          resetsAt: str(pacingRaw.resetsAt),
          pcLimit: num(pacingRaw.pcLimit),
        }
      : null,
    creditsPcRemaining: num(r.creditsPcRemaining),
    limitReached: r.limitReached === true,
    limitReason: pick(r.limitReason, LIMIT_REASONS),
    limitResetsAt: str(r.limitResetsAt),
  };
}

/** Keeps only the customer-facing fields of server history entries. */
export function toCustomerUsageHistory(raw: unknown): CustomerUsageHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): CustomerUsageHistoryEntry[] => {
    if (!item || typeof item !== 'object') return [];
    const e = item as Record<string, unknown>;
    const bucketType = pick(e.bucketType, BUCKET_TYPES);
    const at = str(e.at);
    if (!bucketType || !at) return [];
    return [{ at, category: str(e.category) ?? 'chat', bucketType, pc: num(e.pc) }];
  });
}

function formatResetTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** What the customer is told when a paid call can't be funded. Never mentions cost or allowance. */
export function usageLimitMessage(reason: UsageLimitReason, resetsAt: string | null = null): string {
  switch (reason) {
    case 'plan_weekly_paced': {
      const when = formatResetTime(resetsAt);
      return `Weekly limit reached\nYou've used this week's share of your plan. The rest of your plan is still there${when ? ` — your weekly limit resets ${when}` : ' — it resets at the start of next week'}.`;
    }
    case 'plan_exhausted':
      return "Pending billing\nYou've used everything included in your plan for this period, including your credits. Complete billing to keep using PawOS, or wait for your plan to renew.";
    case 'no_allowance':
      return 'Limit reached\nYou have no PC left. Buy credits or upgrade your plan to keep going.';
    case 'service_unavailable':
    default:
      return "Usage service unavailable\nPawOS couldn't confirm your remaining PC, so the request wasn't sent. Check your connection and try again.";
  }
}
