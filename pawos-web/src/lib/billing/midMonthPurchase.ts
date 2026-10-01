import {
  calculateTicketBalanceInrPayment,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayCredentials,
  verifyRazorpayOrderPaymentSignature,
} from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

/**
 * Mid-month purchase: extra usage for the rest of the current Pro / Pro Max plan period, sold at a
 * fixed price per plan ($15 Pro, $50 Pro Max 5x, $175 Pro Max 20x). The product, its price and the
 * plan period it extends are decided by the database (pawos_mid_month_offer) from the buyer's own
 * active plan — never by the client. The bucket expires when that plan period ends.
 *
 * Only customer-facing values leave this module: price, PC, label and the expiry date.
 */
export type MidMonthOffer = {
  productKey: string;
  planBucketId: string;
  priceCents: number;
  pc: number;
  label: string;
  expiresAt: string;
};

export const MID_MONTH_PRODUCT_TYPE = "mid_month_purchase";

/** The mid-month purchase available to this user right now, or null without an active paid plan. */
export async function getMidMonthOffer(userId: string): Promise<MidMonthOffer | null> {
  const { data, error } = await createServiceClient().rpc("pawos_mid_month_offer", { p_user_id: userId });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  const offer = data as Record<string, unknown>;
  if (typeof offer.productKey !== "string" || typeof offer.planBucketId !== "string" || typeof offer.priceCents !== "number") return null;
  return {
    productKey: offer.productKey,
    planBucketId: offer.planBucketId,
    priceCents: offer.priceCents,
    pc: typeof offer.pc === "number" ? offer.pc : offer.priceCents,
    label: typeof offer.label === "string" ? offer.label : "Extra usage",
    expiresAt: String(offer.expiresAt ?? ""),
  };
}

/** Razorpay Order payload for an offer. The order's notes are what verification trusts later. */
export function buildMidMonthOrderPayload(offer: MidMonthOffer, userId: string):
  | { ok: true; amountUsd: number; amountInr: number; amountPaise: number; usdInrRate: number; payload: { amount: number; currency: "INR"; notes: Record<string, string> } }
  | { ok: false; reason: string } {
  const conversion = calculateTicketBalanceInrPayment(offer.priceCents / 100);
  if (!conversion) return { ok: false, reason: "This purchase is not available right now." };
  return {
    ok: true,
    amountUsd: conversion.amountUsd,
    amountInr: conversion.amountInr,
    amountPaise: conversion.amountPaise,
    usdInrRate: conversion.usdInrRate,
    payload: {
      amount: conversion.amountPaise,
      currency: "INR",
      notes: {
        productType: MID_MONTH_PRODUCT_TYPE,
        productKey: offer.productKey,
        planBucketId: offer.planBucketId,
        amountUsd: conversion.amountUsd.toFixed(2),
        amountCents: String(offer.priceCents),
        usdInrRate: String(conversion.usdInrRate),
        amountPaise: String(conversion.amountPaise),
        currency: "INR",
        userId,
      },
    },
  };
}

export interface CreditMidMonthResult {
  ok: boolean;
  reason?: string;
  status?: number;
  expiresAt?: string;
  pc?: number;
}

export type MidMonthPayerIdentity = { source: "callerToken"; userId: string } | { source: "orderNotes" };

/**
 * Verifies a Razorpay payment for a mid-month order and grants its bucket — the same checks as the
 * usage-credits path: signature (browser callback only) → payment re-fetched from Razorpay and
 * captured → order re-fetched, product type and amount match the server-recorded notes → payer
 * identity → idempotent service-role grant (one bucket per Razorpay payment id).
 */
export async function creditVerifiedMidMonthPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  identity: MidMonthPayerIdentity;
}): Promise<CreditMidMonthResult> {
  const { orderId, paymentId, signature, identity } = params;
  const credentials = getRazorpayCredentials();
  if (!credentials) return { ok: false, status: 503, reason: "Payment processing is not configured yet." };

  if (identity.source === "callerToken" && !verifyRazorpayOrderPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return { ok: false, status: 400, reason: "Invalid payment signature." };
  }

  const payment = await fetchRazorpayPayment(paymentId, credentials);
  if (!payment) return { ok: false, status: 502, reason: "Could not verify payment with Razorpay." };
  if (payment.order_id !== orderId) return { ok: false, status: 400, reason: "Payment does not belong to the expected order." };
  if (payment.status !== "captured") return { ok: false, status: 400, reason: `Payment is not captured (status: ${payment.status}).` };
  if (payment.currency !== "INR") return { ok: false, status: 400, reason: `Unexpected currency: ${payment.currency}.` };

  const order = await fetchRazorpayOrder(orderId, credentials);
  if (!order) return { ok: false, status: 502, reason: "Could not verify order with Razorpay." };
  if (order.currency !== "INR" || payment.amount !== order.amount) {
    return { ok: false, status: 400, reason: "Payment amount does not match the Razorpay order." };
  }
  const notes = order.notes ?? {};
  if (notes.productType !== MID_MONTH_PRODUCT_TYPE) return { ok: false, status: 400, reason: "Order is not a mid-month purchase." };

  const amountCents = Number(notes.amountCents);
  const productKey = typeof notes.productKey === "string" ? notes.productKey : "";
  const planBucketId = typeof notes.planBucketId === "string" ? notes.planBucketId : "";
  const orderUserId = typeof notes.userId === "string" ? notes.userId : "";
  if (!Number.isInteger(amountCents) || amountCents <= 0 || !productKey || !planBucketId || !orderUserId) {
    return { ok: false, status: 400, reason: "Order is missing its server-recorded purchase details." };
  }
  const expected = calculateTicketBalanceInrPayment(amountCents / 100);
  if (!expected || payment.amount !== expected.amountPaise) {
    return { ok: false, status: 400, reason: "Payment amount does not match the server-calculated INR amount." };
  }
  if (identity.source === "callerToken" && orderUserId !== identity.userId) {
    return { ok: false, status: 403, reason: "This payment does not belong to your account." };
  }

  let serviceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return { ok: false, status: 503, reason: "Payment was verified, but crediting is not configured yet." };
  }
  // The database re-checks the product price and that the plan still belongs to this user and has
  // not ended; it is idempotent on the payment id.
  const { data, error } = await serviceClient.rpc("grant_mid_month_bucket_service", {
    p_user_id: orderUserId,
    p_razorpay_payment_id: paymentId,
    p_product_key: productKey,
    p_plan_bucket_id: planBucketId,
    p_amount_cents: amountCents,
  });
  if (error) {
    // A captured payment whose plan period ended before it could be granted cannot be credited
    // automatically — surfaced, never silently converted into some other product.
    const ended = /plan period has ended|plan does not match/.test(error.message);
    return {
      ok: false,
      status: ended ? 409 : 500,
      reason: ended
        ? `Your plan period ended before this purchase could be added. Contact support with payment ID ${paymentId} for a refund.`
        : `Failed to add the purchase: ${error.message}`,
    };
  }
  const grant = (data ?? {}) as { expiresAt?: string };
  return { ok: true, expiresAt: grant.expiresAt ? String(grant.expiresAt) : undefined, pc: amountCents };
}
