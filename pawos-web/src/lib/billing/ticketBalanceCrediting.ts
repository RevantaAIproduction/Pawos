import {
  getRazorpayCredentials,
  verifyRazorpayOrderPaymentSignature,
  fetchRazorpayPayment,
  fetchRazorpayOrder,
  getTicketPricingConfig,
  calculateTicketBalanceInrPayment,
} from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

export interface CreditTicketBalanceResult {
  ok: boolean;
  reason?: string;
  status?: number;
  amountUsd?: number;
  topupId?: string;
}

/**
 * Who the verified payment is being credited to. Two call sites, two ways of establishing this:
 *
 *  - `callerToken`: the browser-callback route (/api/billing/credit-ticket-balance) already
 *    independently verified the caller's Supabase access token AND (for an org credit) the
 *    caller's real active membership in that org — see that route. This identity is real, but it
 *    is the CALLER's identity, not necessarily the identity of whoever actually paid; see the
 *    order-notes cross-check below for why that distinction matters.
 *  - `orderNotes`: the webhook has no bearer token at all — it can only resolve identity from the
 *    Order's own `notes` (stamped at order-creation time in /api/billing/checkout-credits, from a
 *    verified access token at THAT time).
 */
export type PayerIdentity =
  | { source: "callerToken"; userId: string; organizationId?: string }
  | { source: "orderNotes" };

/**
 * The single, shared "verify a Razorpay one-time payment and credit the Ticket Balance wallet"
 * implementation — used by both the browser-callback route and the webhook handler, so there is
 * exactly one place this logic lives (per the Phase 2 spec's "do not duplicate this policy in
 * multiple unrelated locations" instruction).
 *
 * Flow: verify signature -> re-fetch payment from Razorpay's own API (never trust client amount) ->
 * verify captured/currency/order-linkage/amount bounds -> resolve payer identity (see PayerIdentity
 * above) -> cross-check the order's own notes to confirm this payment genuinely belongs to the
 * resolved payer (closes a real, narrower vulnerability: a leaked-but-real (orderId, paymentId,
 * signature) triple could otherwise be replayed by a DIFFERENT signed-in session and credited to
 * their account instead of the original payer's) -> credit via the idempotent, service-role-only RPC.
 */
export async function creditVerifiedTicketBalancePayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  identity: PayerIdentity;
}): Promise<CreditTicketBalanceResult> {
  const { orderId, paymentId, signature, identity } = params;

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return { ok: false, status: 503, reason: "Payment processing is not configured yet. Business Configuration Required." };
  }

  // Step 1: real cryptographic proof this exact (orderId, paymentId) pair was genuinely processed
  // by Razorpay — a forged pair without key_secret cannot produce a matching signature.
  //
  // Skipped only for the webhook path (identity.source === 'orderNotes'): a webhook event never
  // carries a Checkout.js order/payment signature at all (that value only ever exists client-side,
  // handed to the browser's `handler` callback) — the webhook's own authenticity is established
  // upstream, before this function is ever called, via verifyRazorpayWebhookSignature() against
  // RAZORPAY_WEBHOOK_SECRET (an HMAC over the raw webhook body, a completely different signature
  // than this one). Requiring this signature for the webhook path would make every real webhook
  // credit impossible, not just forged ones.
  if (identity.source === "callerToken" && !verifyRazorpayOrderPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return { ok: false, status: 400, reason: "Invalid payment signature." };
  }

  // Step 2: re-derive the REAL payment status/order linkage from Razorpay's own API — never trust the client.
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

  // Step 3: independently re-fetch the ORDER (not just the payment) to read its own notes — the
  // record of who this payment was actually created for, stamped at order-creation time.
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
  const { minTopupUsd, maxTopupUsd } = getTicketPricingConfig();
  if (amountUsd < minTopupUsd) {
    return { ok: false, status: 400, reason: "Payment amount is below the minimum top-up." };
  }
  if (amountUsd > maxTopupUsd) {
    return { ok: false, status: 400, reason: `Payment amount exceeds the maximum top-up of $${maxTopupUsd.toLocaleString()}.` };
  }

  const orderUserId = typeof order.notes?.userId === "string" ? order.notes.userId : "";
  const orderOrganizationId = typeof order.notes?.organizationId === "string" ? order.notes.organizationId : "";

  // Step 4: resolve the final payer identity for this credit.
  let userId: string | null;
  let organizationId: string | null;
  if (identity.source === "orderNotes") {
    // The webhook has no bearer token — identity comes ENTIRELY from the order's own notes.
    if (!orderUserId) {
      return { ok: false, status: 400, reason: "Order has no recorded payer identity — cannot credit from a webhook event alone." };
    }
    userId = orderOrganizationId ? null : orderUserId;
    organizationId = orderOrganizationId || null;
  } else {
    // The browser-callback route already verified this caller's own access token (and, for an org
    // credit, their real active membership). Cross-check against the order's own notes: if the
    // order recorded a real payer at creation time, this call's caller must be that same payer —
    // otherwise a leaked-but-real (orderId, paymentId, signature) triple could be credited to a
    // different account than the one that actually paid.
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
  let serviceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return { ok: false, status: 503, reason: "Payment was verified, but crediting is not configured yet. Business Configuration Required." };
  }
  const { data: topupId, error: rpcError } = await serviceClient.rpc("add_ticket_balance_service", {
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
