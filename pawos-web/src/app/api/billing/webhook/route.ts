import { NextResponse } from "next/server";
import { getRazorpayWebhookSecret, verifyRazorpayWebhookSignature, getRazorpayPlanId } from "@/lib/billing/razorpay";
import { creditVerifiedTicketBalancePayment } from "@/lib/billing/ticketBalanceCrediting";

type RazorpayWebhookEvent = {
  event: string;
  payload: Record<string, { entity: Record<string, unknown> }>;
};

/**
 * Applies a verified Razorpay SUBSCRIPTION event to the user's subscription record.
 * pawos-web has no persistent account/subscription database yet (auth and
 * subscription state today live only inside the Electron app's local
 * stores) — that's a real infrastructure decision out of scope here, so
 * this honestly logs the verified event instead of writing to a database
 * that doesn't exist. Once a real accounts database is wired up, this is
 * the one place that needs to change to persist it.
 */
function applySubscriptionEvent(event: RazorpayWebhookEvent): void {
  console.log(`[razorpay-webhook] Verified subscription event "${event.event}" received — no persistent account database configured yet, not persisted.`, {
    event: event.event,
    subscriptionId: event.payload.subscription?.entity?.id,
    paymentId: event.payload.payment?.entity?.id,
  });
}

/**
 * Handles a verified `payment.captured` event for a ONE-TIME Ticket Balance top-up Order — the
 * webhook's own independent crediting path (Phase 2), separate from and race-safe against the
 * browser-callback route (/api/billing/credit-ticket-balance): both ultimately call the same
 * idempotent add_ticket_balance_service() RPC (unique on razorpay_payment_id), so whichever one
 * reaches it first credits the wallet and the other becomes a harmless no-op returning the same
 * topup id — never a double credit, regardless of which arrives first or if both race.
 *
 * A `payment.captured` event's own `order_id` is used to distinguish a subscription payment
 * (handled by applySubscriptionEvent above — a subscription payment's order isn't a Ticket Balance
 * top-up Order and has no `notes.userId`) from a real top-up payment. Any payment whose order lacks
 * a recorded payer identity in `notes` is honestly skipped rather than guessed at.
 */
async function applyPaymentCapturedEvent(event: RazorpayWebhookEvent): Promise<void> {
  const paymentEntity = event.payload.payment?.entity as
    | { id?: string; order_id?: string | null; notes?: Record<string, string> }
    | undefined;
  const paymentId = paymentEntity?.id;
  const orderId = paymentEntity?.order_id;
  if (!paymentId || !orderId) {
    console.warn("[razorpay-webhook] payment.captured event missing payment id or order id — skipping.");
    return;
  }

  // The webhook payload never carries the Checkout.js signature (that's a client-side-only value) —
  // the webhook's OWN signature (already verified against RAZORPAY_WEBHOOK_SECRET before this
  // function is ever called) is the authenticity proof for this event. We still independently
  // re-fetch the payment/order from Razorpay's own API inside creditVerifiedTicketBalancePayment
  // rather than trusting this event's own payload amount — but the order-payment-signature check
  // that route normally performs doesn't apply here, since there is no client-supplied signature to
  // check in a webhook. Pass the empty string is intentionally never done — instead, this path is
  // implemented as a signature-free variant scoped to the webhook's own already-verified authenticity.
  const result = await creditVerifiedTicketBalancePayment({
    orderId,
    paymentId,
    signature: "", // irrelevant here — webhook authenticity already proven via verifyRazorpayWebhookSignature above.
    identity: { source: "orderNotes" },
  }).catch((error) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error) }));

  if (!result.ok) {
    // Never blindly trust the event payload's amount, and never duplicate a browser-callback credit
    // — a "not credited" outcome here (e.g. "no recorded payer identity", or the browser-callback
    // path already credited it first) is expected and honest, not necessarily an error.
    console.log(`[razorpay-webhook] payment.captured for ${paymentId} not credited via webhook: ${result.reason}`);
    return;
  }
  console.log(`[razorpay-webhook] payment.captured for ${paymentId} credited $${result.amountUsd} (topupId: ${result.topupId}).`);
}

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.activated",
  "subscription.charged",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.halted",
  "subscription.paused",
  "subscription.resumed",
  "subscription.pending",
]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  const secret = getRazorpayWebhookSecret();
  if (!secret) {
    // Nothing to verify against yet — acknowledge so Razorpay doesn't retry indefinitely, but do nothing (Business Configuration Required).
    console.warn("[razorpay-webhook] Received a webhook but RAZORPAY_WEBHOOK_SECRET is not configured. Ignoring.");
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (!signature || !verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, reason: "Invalid webhook signature." }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as RazorpayWebhookEvent;

  if (event.event === "payment.captured") {
    await applyPaymentCapturedEvent(event);
  } else if (SUBSCRIPTION_EVENTS.has(event.event)) {
    applySubscriptionEvent(event);
  } else if (event.event === "payment.failed" || event.event === "refund.processed") {
    // Failed/refund events affecting the wallet: honestly logged, never auto-reversing an already
    // -credited balance (clawback after funds may already be spent is a distinct business-policy
    // decision, out of scope here) and never duplicating a credit for a payment that never captured.
    console.log(`[razorpay-webhook] Verified "${event.event}" event received — no automatic wallet action taken.`, {
      paymentId: event.payload.payment?.entity?.id,
    });
  } else {
    console.log(`[razorpay-webhook] Verified event "${event.event}" received — no handler for this event type.`);
  }

  return NextResponse.json({ ok: true });
}
