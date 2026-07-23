import { NextResponse } from "next/server";
import { getRazorpayWebhookSecret, verifyRazorpayWebhookSignature } from "@/lib/billing/razorpay";

type RazorpayWebhookEvent = {
  event: string;
  payload: Record<string, { entity: Record<string, unknown> }>;
};

/**
 * Applies a verified Razorpay event to the user's subscription record.
 * pawos-web has no persistent account/subscription database yet (auth and
 * subscription state today live only inside the Electron app's local
 * stores) — that's a real infrastructure decision out of scope here, so
 * this honestly logs the verified event instead of writing to a database
 * that doesn't exist. Once a real accounts database is wired up, this is
 * the one place that needs to change to persist it.
 */
function applySubscriptionEvent(event: RazorpayWebhookEvent): void {
  console.log(`[razorpay-webhook] Verified event "${event.event}" received — no persistent account database configured yet, not persisted.`, {
    event: event.event,
    subscriptionId: event.payload.subscription?.entity?.id,
    paymentId: event.payload.payment?.entity?.id,
  });
}

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
  applySubscriptionEvent(event);

  return NextResponse.json({ ok: true });
}
