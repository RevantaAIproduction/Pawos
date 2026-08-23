import {
  getRazorpayCredentials,
  verifyRazorpayOrderPaymentSignature,
  fetchRazorpayPayment,
  fetchRazorpayOrder,
  getUsageCreditsPricingConfig,
  calculateTicketBalanceInrPayment,
} from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

export interface CreditUsageCreditsResult {
  ok: boolean;
  reason?: string;
  status?: number;
  amountUsd?: number;
  topupId?: string;
}

export type UsageCreditsPayerIdentity =
  | { source: "callerToken"; userId: string; organizationId?: string }
  | { source: "orderNotes" };

/**
 * The shared "verify a Razorpay one-time payment and credit the Usage Credits wallet" implementation.
 * Structurally identical to creditVerifiedTicketBalancePayment but routes to `add_usage_credits_service`
 * (NOT `add_ticket_balance_service`) and enforces the $5 minimum (not $30).
 *
 * Security guarantees are identical: signature verification → Razorpay payment re-fetch →
 * productType check → payer identity cross-check → idempotent service-role RPC.
 *
 * NOTE: The `add_usage_credits_service` RPC must exist in Supabase with the same signature as
 * `add_ticket_balance_service` but crediting the `usage_credits_balance` column instead of
 * `autonomous_work_credits` — see the DB migration for this RPC.
 */
export async function creditVerifiedUsageCreditsPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  identity: UsageCreditsPayerIdentity;
}): Promise<CreditUsageCreditsResult> {
  const { orderId, paymentId, signature, identity } = params;

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return { ok: false, status: 503, reason: "Payment processing is not configured yet. Business Configuration Required." };
  }

  // Step 1: real cryptographic proof this exact (orderId, paymentId) pair was genuinely processed
  // by Razorpay. Skipped for webhook path (identity.source === 'orderNotes') — see ticketBalanceCrediting.ts.
  if (identity.source === "callerToken" && !verifyRazorpayOrderPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return { ok: false, status: 400, reason: "Invalid payment signature." };
  }

  // Step 2: re-derive the REAL payment status/order linkage from Razorpay's own API.
  const payment = await fetchRazorpayPayment(paymentId, credentials);
  if (!payment) {
    return { ok: false, status: 502, reason: "Could not verify payment with Razorpay." };
  }
  if (payment.order_id !== orderId) {
    return { ok: false, status: 400, reason: "Payment does not belong to the expected order." };
  }
  if (payment.status !== "captured") {
    return { ok: false, status: 400, reason: `Payment is not captured (status: ${payment.status}).` };
  }
  if (payment.currency !== "INR") {
    return { ok: false, status: 400, reason: `Unexpected currency: ${payment.currency}.` };
  }

  // Step 3: independently re-fetch the ORDER to read its notes.
  const order = await fetchRazorpayOrder(orderId, credentials);
  if (!order) {
    return { ok: false, status: 502, reason: "Could not verify order with Razorpay." };
  }
  if (order.currency !== "INR") {
    return { ok: false, status: 400, reason: `Unexpected order currency: ${order.currency}.` };
  }
  if (payment.amount !== order.amount) {
    return { ok: false, status: 400, reason: "Payment amount does not match the Razorpay order amount." };
  }

  // Verify server-stamped productType — ensures this crediting function is only called for usage_credits orders.
  const productType = order.notes?.productType;
  if (productType && productType !== "usage_credits") {
    return { ok: false, status: 400, reason: "Order product type does not match usage_credits." };
  }

  const orderAmountUsd = Number(order.notes?.amountUsd);
  if (!Number.isFinite(orderAmountUsd)) {
    return { ok: false, status: 400, reason: "Order is missing the server-recorded USD amount." };
  }
  const expectedPayment = calculateTicketBalanceInrPayment(orderAmountUsd);
  if (!expectedPayment) {
    return { ok: false, status: 400, reason: "Order has an invalid server-recorded USD amount." };
  }
  if (payment.amount !== expectedPayment.amountPaise) {
    return { ok: false, status: 400, reason: "Payment amount does not match the server-calculated INR amount." };
  }
  const amountUsd = expectedPayment.amountUsd;
  const { minTopupUsd, maxTopupUsd } = getUsageCreditsPricingConfig();
  if (amountUsd < minTopupUsd) {
    return { ok: false, status: 400, reason: "Payment amount is below the minimum top-up." };
  }
  if (amountUsd > maxTopupUsd) {
    return { ok: false, status: 400, reason: `Payment amount exceeds the maximum top-up of $${maxTopupUsd.toLocaleString()}.` };
  }

  const orderUserId = typeof order.notes?.userId === "string" ? order.notes.userId : "";
  const orderOrganizationId = typeof order.notes?.organizationId === "string" ? order.notes.organizationId : "";

  // Step 4: resolve payer identity.
  let userId: string | null;
  let organizationId: string | null;
  if (identity.source === "orderNotes") {
    if (!orderUserId) {
      return { ok: false, status: 400, reason: "Order has no recorded payer identity — cannot credit from a webhook event alone." };
    }
    userId = orderOrganizationId ? null : orderUserId;
    organizationId = orderOrganizationId || null;
  } else {
    if (orderUserId && orderUserId !== identity.userId) {
      return { ok: false, status: 403, reason: "This payment does not belong to your account." };
    }
    const callerOrgId = identity.organizationId ?? "";
    if (orderOrganizationId && callerOrgId && orderOrganizationId !== callerOrgId) {
      return { ok: false, status: 403, reason: "This payment was made for a different organization." };
    }
    userId = identity.organizationId ? null : identity.userId;
    organizationId = identity.organizationId ?? null;
  }

  // Step 5: credit — service-role only, idempotent on razorpay_payment_id.
  // Routes to add_usage_credits_service (NOT add_ticket_balance_service).
  let serviceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return { ok: false, status: 503, reason: "Payment was verified, but crediting is not configured yet. Business Configuration Required." };
  }
  const { data: topupId, error: rpcError } = await serviceClient.rpc("add_usage_credits_service", {
    p_user_id: userId,
    p_organization_id: organizationId,
    p_amount_usd: amountUsd,
    p_razorpay_payment_id: paymentId,
  });
  if (rpcError) {
    return { ok: false, status: 500, reason: `Failed to credit balance: ${rpcError.message}` };
  }

  return { ok: true, amountUsd, topupId: topupId as string };
}
