import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { DEFAULT_TICKET_BALANCE_USD_INR_RATE, fetchRazorpayOrder, fetchRazorpayPayment, getRazorpayCredentials, verifyRazorpayOrderPaymentSignature } from "@/lib/billing/razorpay";

/**
 * Additional seats for a Paw Team organization.
 *
 *   order     POST /api/billing/checkout-seat — the signed-in caller must manage the organization;
 *             the server prices the seats and records organization, buyer, seat tier and quantity
 *             in the Razorpay order's notes.
 *   payment   Razorpay.
 *   verify    POST /api/billing/verify-seat-payment (or the payment.captured webhook) — the payment
 *             and the order are re-read from Razorpay; the organization, tier and quantity come
 *             from the order's notes, never from the request.
 *   apply     pawos_apply_seat_purchase() (service role only) adds the seats once per payment.
 *   enforce   the database refuses memberships beyond the paid seats
 *             (20261007010000_security_seats_and_admin_identity.sql).
 *
 * The app never changes organizations.seat_count itself.
 */
export const SEAT_PRODUCT_TYPE = "seat_purchase";

export type SeatTier = "standard" | "premium";

/** Per seat, per month, in paise — the one price list for Team seats (the plan checkout uses it too). */
export const TEAM_SEAT_PRICE_PAISE: Record<SeatTier, number> = {
  standard: 191300, // ₹1,913
  premium: 956500, // ₹9,565
};

export const MAX_SEATS_PER_PURCHASE = 100;

/** Roles that may buy seats for an organization (the same set the database function accepts). */
const SEAT_BUYER_ROLES = new Set(["owner", "organizationOwner", "organizationAdministrator", "billingAdministrator"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSeatTier(value: unknown): value is SeatTier {
  return value === "standard" || value === "premium";
}

export function seatPurchaseAmountPaise(seatTier: SeatTier, seats: number): number {
  return TEAM_SEAT_PRICE_PAISE[seatTier] * seats;
}

export type SeatOrder =
  | { ok: false; status: number; reason: string }
  | { ok: true; amountPaise: number; amountInr: number; amountUsd: number; usdInrRate: number; payload: { amount: number; currency: "INR"; notes: Record<string, string> } };

/**
 * Builds the Razorpay order for `seats` more seats, after checking — as the caller, so row level
 * security applies — that the organization is a Team organization the caller manages.
 */
export async function buildSeatOrder(params: { callerClient: SupabaseClient; userId: string; organizationId: unknown; seatTier: unknown; seats: unknown }): Promise<SeatOrder> {
  const { callerClient, userId } = params;
  const organizationId = typeof params.organizationId === "string" && UUID_RE.test(params.organizationId) ? params.organizationId : null;
  const seats = params.seats === undefined ? 1 : params.seats;
  if (!organizationId) return { ok: false, status: 400, reason: "Choose the organization to add seats to." };
  if (!isSeatTier(params.seatTier)) return { ok: false, status: 400, reason: "Choose a Standard or Premium seat." };
  if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS_PER_PURCHASE) {
    return { ok: false, status: 400, reason: `Choose between 1 and ${MAX_SEATS_PER_PURCHASE} seats.` };
  }

  const [organization, membership] = await Promise.all([
    callerClient.from("organizations").select("id, tier, owner_user_id").eq("id", organizationId).maybeSingle(),
    callerClient.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  const org = organization.data as { id: string; tier: string; owner_user_id: string } | null;
  if (!org) return { ok: false, status: 404, reason: "That organization doesn't exist." };
  const role = (membership.data as { role?: string } | null)?.role;
  if (org.owner_user_id !== userId && !(role && SEAT_BUYER_ROLES.has(role))) {
    return { ok: false, status: 403, reason: "Only the organization's owner or a billing administrator can buy seats." };
  }
  if (org.tier !== "team") {
    return { ok: false, status: 400, reason: org.tier === "enterprise" ? "Enterprise seats are arranged with PawOS sales." : "Seats can be added once the organization is on Paw Team." };
  }

  const seatTier = params.seatTier;
  const amountPaise = seatPurchaseAmountPaise(seatTier, seats);
  const usdInrRate = DEFAULT_TICKET_BALANCE_USD_INR_RATE;
  const amountInr = amountPaise / 100;
  const amountUsd = Math.round((amountInr / usdInrRate) * 100) / 100;
  return {
    ok: true,
    amountPaise,
    amountInr,
    amountUsd,
    usdInrRate,
    payload: {
      amount: amountPaise,
      currency: "INR",
      notes: { productType: SEAT_PRODUCT_TYPE, organizationId, seatTier, seats: String(seats), amountPaise: String(amountPaise), userId },
    },
  };
}

export interface SeatPurchaseResult {
  ok: boolean;
  status?: number;
  reason?: string;
  /** False when this payment's seats had already been added (a repeat verification). */
  applied?: boolean;
  organizationId?: string;
  seatTier?: SeatTier;
  seats?: number;
  seatCount?: number;
  paidPremiumSeats?: number;
}

/**
 * Verifies a seat payment and adds the seats. `callerUserId` is given when a signed-in user asks
 * (their Checkout.js signature is checked and they must be the buyer on the order); the webhook,
 * whose own signature was already verified, passes neither.
 */
export async function applyVerifiedSeatPayment(params: { orderId: string; paymentId: string; signature?: string; callerUserId?: string }): Promise<SeatPurchaseResult> {
  const { orderId, paymentId } = params;
  const credentials = getRazorpayCredentials();
  if (!credentials) return { ok: false, status: 503, reason: "Payment processing is not configured yet." };

  if (params.callerUserId !== undefined) {
    if (!params.signature || !verifyRazorpayOrderPaymentSignature(orderId, paymentId, params.signature, credentials.keySecret)) {
      return { ok: false, status: 400, reason: "Invalid payment signature." };
    }
  }

  const payment = await fetchRazorpayPayment(paymentId, credentials);
  if (!payment) return { ok: false, status: 502, reason: "Could not verify payment with Razorpay." };
  if (payment.order_id !== orderId) return { ok: false, status: 400, reason: "Payment does not belong to the expected order." };
  if (payment.status !== "captured") return { ok: false, status: 400, reason: `Payment is not captured (status: ${payment.status}).` };
  if (payment.currency !== "INR") return { ok: false, status: 400, reason: `Unexpected currency: ${payment.currency}.` };

  const order = await fetchRazorpayOrder(orderId, credentials);
  if (!order) return { ok: false, status: 502, reason: "Could not verify the order with Razorpay." };
  if (order.status !== "paid") return { ok: false, status: 402, reason: `Order is not paid (status: ${order.status}).` };

  // Everything below comes from the order PawOS created — not from whoever is asking.
  const notes = order.notes ?? {};
  if (notes.productType !== SEAT_PRODUCT_TYPE) return { ok: false, status: 400, reason: "Order is not a seat purchase." };
  const organizationId = typeof notes.organizationId === "string" && UUID_RE.test(notes.organizationId) ? notes.organizationId : null;
  const buyerUserId = typeof notes.userId === "string" && UUID_RE.test(notes.userId) ? notes.userId : null;
  const seats = Number(notes.seats);
  if (!organizationId || !buyerUserId || !isSeatTier(notes.seatTier) || !Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS_PER_PURCHASE) {
    return { ok: false, status: 400, reason: "Order is missing its seat details." };
  }
  const seatTier = notes.seatTier;
  const expectedPaise = seatPurchaseAmountPaise(seatTier, seats);
  if (order.amount !== expectedPaise || payment.amount !== expectedPaise) {
    return { ok: false, status: 400, reason: "The amount paid does not match the seats on the order." };
  }
  if (params.callerUserId !== undefined && params.callerUserId !== buyerUserId) {
    return { ok: false, status: 403, reason: "This payment belongs to a different account." };
  }

  const { data, error } = await createServiceClient().rpc("pawos_apply_seat_purchase", {
    p_payment_id: paymentId,
    p_order_id: orderId,
    p_organization_id: organizationId,
    p_buyer_user_id: buyerUserId,
    p_seat_tier: seatTier,
    p_seats: seats,
  });
  if (error) {
    console.error("[seat-purchase] could not add seats for payment", paymentId, "-", error.message);
    return { ok: false, status: 500, reason: "The payment was received but the seats could not be added yet. It will be retried; contact support if it does not appear." };
  }
  const result = (data ?? {}) as { applied?: boolean; seatCount?: number; paidPremiumSeats?: number };
  return { ok: true, applied: result.applied === true, organizationId, seatTier, seats, seatCount: result.seatCount, paidPremiumSeats: result.paidPremiumSeats };
}
