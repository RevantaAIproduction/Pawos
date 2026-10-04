import type { AccountContext } from "./accountContext";

/**
 * The account's Paw Compute (PC) usage, from get_my_usage_summary() — the same server function the
 * desktop app's usage panel reads (see supabase/migrations/20261001000000_usage_buckets.sql). This
 * only reshapes that response for display; it computes no allowance of its own.
 */

export interface UsageBucket {
  id: string;
  label: string;
  type: string;
  pcTotal: number;
  pcUsed: number;
  percentUsed: number;
  status: string;
  /** When a monthly plan allowance resets. ISO string. */
  resetsAt: string | null;
  /** When a purchased allowance expires. ISO string. */
  expiresAt: string | null;
}

export interface UsageOverview {
  planLabel: string | null;
  buckets: UsageBucket[];
  weeklyPacing: { percentUsed: number; reached: boolean; resetsAt: string | null } | null;
  limitReached: boolean;
  limitResetsAt: string | null;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** Null when usage can't be read right now — the page says so rather than showing zeros. */
export async function getUsageOverview(account: AccountContext): Promise<UsageOverview | null> {
  const { data, error } = await account.supabase.rpc("get_my_usage_summary");
  if (error || !data || typeof data !== "object") return null;
  const summary = data as Record<string, unknown>;
  const plan = summary.plan as Record<string, unknown> | null;
  const pacing = summary.weeklyPacing as Record<string, unknown> | null;
  const buckets = Array.isArray(summary.buckets) ? (summary.buckets as Record<string, unknown>[]) : [];
  return {
    planLabel: plan ? str(plan.label) : null,
    buckets: buckets
      .filter((bucket) => bucket.status === "active" || bucket.status === "exhausted")
      .map((bucket) => ({
        id: String(bucket.id),
        label: str(bucket.label) ?? "Allowance",
        type: str(bucket.type) ?? "",
        pcTotal: num(bucket.pcTotal),
        pcUsed: num(bucket.pcUsed),
        percentUsed: Math.min(100, Math.max(0, num(bucket.percentUsed))),
        status: str(bucket.status) ?? "active",
        resetsAt: str(bucket.resetsAt),
        expiresAt: str(bucket.expiresAt),
      })),
    weeklyPacing: pacing ? { percentUsed: num(pacing.percentUsed), reached: pacing.reached === true, resetsAt: str(pacing.resetsAt) } : null,
    limitReached: summary.limitReached === true,
    limitResetsAt: str(summary.limitResetsAt),
  };
}
