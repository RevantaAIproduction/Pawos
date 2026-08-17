import { NextResponse } from "next/server";
import {
  fetchRazorpaySubscription,
  getRazorpayCredentials,
  resolveTierFromRazorpayPlanId,
  verifyRazorpaySubscriptionPaymentSignature,
} from "@/lib/billing/razorpay";

const ACTIVE_STATUSES = new Set(["active", "authenticated"]);
const ALLOWED_RUNTIME_IDS = new Set(["coding"]);

/**
 * P0-3 security fix. This is the server-side counterpart of CheckoutSyncServer.ts's fix: instead of
 * the local loopback server trusting whatever `plan`/`orderId` query params a caller (a same-machine
 * script, or an XSS'd checkout tab) happens to supply, Electron's CheckoutSyncServer now calls this
 * route server-to-server with the real (paymentId, subscriptionId, signature) triple Razorpay's
 * Checkout.js handed to the browser, and this route is the one place that decides which tier that
 * actually corresponds to — using Razorpay's own signature and its own subscription record, never a
 * client-supplied tier string.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const paymentId = body?.paymentId as string | undefined;
  const subscriptionId = body?.subscriptionId as string | undefined;
  const signature = body?.signature as string | undefined;

  if (!paymentId || !subscriptionId || !signature) {
    return NextResponse.json({ ok: false, reason: "Missing payment verification data." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured. Business Configuration Required." }, { status: 503 });
  }

  if (!verifyRazorpaySubscriptionPaymentSignature(paymentId, subscriptionId, signature, credentials.keySecret)) {
    return NextResponse.json({ ok: false, reason: "Invalid payment signature." }, { status: 400 });
  }

  const subscription = await fetchRazorpaySubscription(subscriptionId, credentials);
  if (!subscription) {
    return NextResponse.json({ ok: false, reason: "Could not verify the subscription with Razorpay." }, { status: 502 });
  }
  if (!ACTIVE_STATUSES.has(subscription.status)) {
    return NextResponse.json({ ok: false, reason: `Subscription is not active (status: ${subscription.status}).` }, { status: 402 });
  }

  const resolved = resolveTierFromRazorpayPlanId(subscription.plan_id);
  if (!resolved) {
    return NextResponse.json({ ok: false, reason: "Subscription plan does not match any known PawOS tier." }, { status: 400 });
  }

  // runtimeIds is read back from Razorpay's own notes (round-tripped, real, Razorpay-attested data
  // set at subscription-creation time — see checkout/route.ts) rather than trusted from the caller.
  const rawRuntimeIds = subscription.notes?.runtimeIds ?? "";
  const runtimeIds = rawRuntimeIds
    .split(",")
    .map((id) => id.trim())
    .filter((id, index, list) => ALLOWED_RUNTIME_IDS.has(id) && list.indexOf(id) === index);

  return NextResponse.json({
    ok: true,
    tier: resolved.tier,
    seatTier: resolved.seatTier,
    subscriptionId: subscription.id,
    runtimeIds,
  });
}
