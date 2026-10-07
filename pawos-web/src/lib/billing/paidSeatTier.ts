import type { SupabaseClient } from "@supabase/supabase-js";

export type PaidSeatTier = "standard" | "premium";

/** The seat tier a verified Razorpay order was for (its notes.seatTier), or null when it has none. */
export function paidSeatTierFromNotes(notes: Record<string, unknown> | null | undefined): PaidSeatTier | null {
  const value = notes?.seatTier;
  return value === "premium" || value === "standard" ? value : null;
}

/**
 * After a verified Paw Team plan payment has set the organization's seat_count: records how many
 * of those seats are Premium (organizations.paid_premium_seats) — all of them when the plan was
 * bought on Premium seats, none when on Standard. The database only lets as many members hold a
 * Premium seat as this says (20261007010000_security_seats_and_admin_identity.sql), and clients
 * can never write the column — only this server's service-role client can. Seats added later go
 * through pawos_apply_seat_purchase (lib/billing/seatPurchase.ts), which keeps both counts.
 *
 * A separate write from the tier / seat-count update on purpose: if it fails (for example the
 * column does not exist yet because that migration has not been applied), the paid plan itself is
 * still activated and the failure is logged.
 */
export async function recordPaidSeatTier(serviceClient: SupabaseClient, organizationId: string, tier: string, seatTier: PaidSeatTier | null, paidSeats: number): Promise<void> {
  if (tier !== "team" || !seatTier) return;
  const premiumSeats = seatTier === "premium" && Number.isInteger(paidSeats) && paidSeats > 0 ? paidSeats : 0;
  const { error } = await serviceClient.from("organizations").update({ paid_premium_seats: premiumSeats }).eq("id", organizationId);
  if (error) console.warn("[billing] Could not record the paid Premium seats for organization", organizationId, "-", error.message);
}
