import { NextResponse } from "next/server";
import { getRazorpayWebhookSecret, verifyRazorpayWebhookSignature, getRazorpayPlanId } from "@/lib/billing/razorpay";
import { creditVerifiedTicketBalancePayment } from "@/lib/billing/ticketBalanceCrediting";
import { creditVerifiedUsageCreditsPayment } from "@/lib/billing/usageCreditsCrediting";

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

  // Dispatch to the correct crediting function based on the server-stamped productType in the
  // payment entity's notes. Razorpay includes the order's notes in the payment entity in webhook
  // payloads, making this field available without an extra Razorpay API call.
  //
  // The productType was stamped at order-creation time in:
  //   - /api/billing/checkout-credits     → "ticket_balance"  (Autonomous Work Credits)
  //   - /api/billing/checkout-usage-credits → "usage_credits" (Usage Credits)
  //
  // Neither crediting function ever trusts the webhook payload's amount — both independently
  // re-fetch the payment and order from Razorpay's own API for authoritative amount verification.
  const productType = paymentEntity?.notes?.productType;

  const baseParams = {
    orderId,
    paymentId,
    signature: "", // irrelevant here — webhook authenticity already proven via verifyRazorpayWebhookSignature above.
    identity: { source: "orderNotes" as const },
  };

  const result = await (productType === "usage_credits"
    ? creditVerifiedUsageCreditsPayment(baseParams)
    : creditVerifiedTicketBalancePayment(baseParams) // default: "ticket_balance" (or legacy orders without productType)
  ).catch((error) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error) }));

  if (!result.ok) {
    console.log(`[razorpay-webhook] payment.captured for ${paymentId} (${productType ?? "ticket_balance"}) not credited via webhook: ${result.reason}`);
    return;
  }
  console.log(`[razorpay-webhook] payment.captured for ${paymentId} (${productType ?? "ticket_balance"}) credited $${result.amountUsd} (topupId: ${result.topupId}).`);
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

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid webhook payload." }, { status: 400 });
  }

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
