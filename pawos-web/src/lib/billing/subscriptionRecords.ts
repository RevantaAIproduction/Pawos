import { createServiceClient } from "@/lib/supabase/serviceClient";
import { resolveTierFromRazorpayPlanId, type RazorpaySubscription } from "./razorpay";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionRecord = {
  id: string;
  user_id: string;
  tier: "pro" | "proMax";
  pro_max_variant: "5x" | "20x" | null;
  /** Pro monthly vs Pro yearly (separate Razorpay plans) — Pro Max is always monthly. */
  billing_frequency: "monthly" | "yearly";
  status: string;
  current_period_end: string;
  source: string;
  updated_at: string;
};

/**
 * Turns a Razorpay-verified subscription into the pawos_subscriptions row that lets the desktop app
 * restore the plan on any sign-in (supabase/migrations/20260925060000_pawos_subscriptions.sql).
 * Returns null — with the reason — for anything that isn't a personal Pro / Pro Max plan tied to a
 * PawOS user (Team / Enterprise stay organization-based).
 *
 * userId comes from the subscription's own notes, which /api/billing/checkout sets server-side from
 * the buyer's verified session — never from a request body.
 */
export function toSubscriptionRecord(
  subscription: RazorpaySubscription,
  source: string,
  now = Date.now()
): { record: SubscriptionRecord } | { record: null; reason: string } {
  const userId = subscription.notes?.userId;
  if (!userId) return { record: null, reason: "subscription has no userId note" };
  const resolved = resolveTierFromRazorpayPlanId(subscription.plan_id);
  if (!resolved) return { record: null, reason: `unknown plan ${subscription.plan_id}` };
  if (resolved.tier !== "pro" && resolved.tier !== "proMax") return { record: null, reason: `${resolved.tier} is organization-based` };

  const billingFrequency = resolved.billingFrequency === "yearly" ? "yearly" : "monthly";

  // Paid through the end of the current cycle. Right after checkout Razorpay may not have set
  // current_end yet ("authenticated"); the next charge date — or one cycle (a month, or a year for
  // Pro yearly) — covers that gap until the subscription.charged webhook brings the real value.
  const endSeconds = subscription.current_end ?? subscription.charge_at ?? null;
  const periodEndMs = endSeconds ? endSeconds * 1000 : now + (billingFrequency === "yearly" ? 366 : 31) * DAY_MS;

  return {
    record: {
      id: subscription.id,
      user_id: userId,
      tier: resolved.tier,
      pro_max_variant: resolved.tier === "proMax" ? resolved.proMaxVariant ?? "5x" : null,
      billing_frequency: billingFrequency,
      status: subscription.status,
      current_period_end: new Date(periodEndMs).toISOString(),
      source,
      updated_at: new Date(now).toISOString(),
    },
  };
}

/**
 * Upserts the subscription's current, Razorpay-verified state for its user. Never throws.
 * 'skipped' = not a personal Pro / Pro Max plan (nothing to store); 'failed' = the write failed and
 * should be retried.
 */
export async function recordRazorpaySubscription(subscription: RazorpaySubscription, source: string): Promise<"recorded" | "skipped" | "failed"> {
  const built = toSubscriptionRecord(subscription, source);
  if (!built.record) {
    console.log(`[subscription-records] Not recorded (${source}): ${built.reason}`, { subscriptionId: subscription.id });
    return "skipped";
  }
  try {
    const { error } = await createServiceClient().from("pawos_subscriptions").upsert(built.record, { onConflict: "id" });
    if (error) {
      console.error("[subscription-records] Upsert failed:", error.message, { subscriptionId: subscription.id });
      return "failed";
    }
    return "recorded";
  } catch (error) {
    console.error("[subscription-records] Upsert failed:", error, { subscriptionId: subscription.id });
    return "failed";
  }
}
