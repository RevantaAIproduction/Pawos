import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaidSeatTier } from "@/lib/billing/paidSeatTier";

/** How many seats a verified plan order bought (the defaults the checkout has always used). */
export function planSeats(tier: "team" | "enterprise", seatCount: number | undefined): number {
  const seats = typeof seatCount === "number" && Number.isInteger(seatCount) && seatCount > 0 ? seatCount : 0;
  return seats || (tier === "enterprise" ? 20 : 2);
}

/**
 * Puts the buyer's own organization on the plan a verified Razorpay payment bought, through
 * pawos_apply_plan_purchase (service role only; 20261007010000_security_seats_and_admin_identity.sql).
 * The database applies each payment once and only ever raises the seat counts, so verifying an old
 * plan payment again — a retry, the webhook arriving after the app's own verification, or someone
 * replaying it on purpose — cannot undo seats the organization has bought since.
 *
 *   "applied" / "already-applied"  done (the second means this payment was recorded before)
 *   "unavailable"                  the function does not exist yet (that migration has not been
 *                                  applied) — the caller falls back to the previous direct update so
 *                                  a paid plan is still activated
 *   "failed"                       refused or errored; logged, nothing was changed
 */
export async function applyPlanPurchase(
  serviceClient: SupabaseClient,
  params: { paymentId: string; orderId: string | null; organizationId: string; buyerUserId: string; tier: "team" | "enterprise"; seatTier: PaidSeatTier | null; seats: number }
): Promise<"applied" | "already-applied" | "unavailable" | "failed"> {
  const { data, error } = await serviceClient.rpc("pawos_apply_plan_purchase", {
    p_payment_id: params.paymentId,
    p_order_id: params.orderId,
    p_organization_id: params.organizationId,
    p_buyer_user_id: params.buyerUserId,
    p_tier: params.tier,
    p_seat_tier: params.tier === "team" ? params.seatTier : null,
    p_seats: params.seats,
  });
  if (error) {
    // PostgREST: PGRST202 = no such function in the schema cache; PostgreSQL: 42883 = undefined function.
    if (error.code === "PGRST202" || error.code === "42883") return "unavailable";
    console.warn("[billing] Could not apply the plan purchase for organization", params.organizationId, "-", error.message);
    return "failed";
  }
  return (data as { applied?: boolean } | null)?.applied === true ? "applied" : "already-applied";
}
