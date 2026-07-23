import { NextResponse } from "next/server";
import { getRazorpayCredentials, getRazorpayPlanId, razorpayAuthHeader, type SubscriptionTierId } from "@/lib/billing/razorpay";

const VALID_TIERS: SubscriptionTierId[] = ["go", "pro", "proMax", "team", "enterprise"];

/**
 * Creates a Razorpay subscription for the requested tier and returns the
 * subscription id + Razorpay key id the client needs to open Checkout.js.
 * Real Razorpay secrets never leave this route — the client only ever
 * receives the public key id (which Razorpay's own Checkout.js requires
 * client-side by design) and a subscription id, never the key secret.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const plan = body?.plan as SubscriptionTierId | undefined;

  if (!plan || !VALID_TIERS.includes(plan)) {
    return NextResponse.json({ ok: false, reason: "Unknown plan requested." }, { status: 400 });
  }
  if (plan === "go") {
    return NextResponse.json({ ok: false, reason: "Paw Go is free and has no checkout." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." },
      { status: 503 }
    );
  }

  const planId = getRazorpayPlanId(plan);
  if (!planId) {
    return NextResponse.json(
      { ok: false, reason: `No Razorpay plan is configured for Paw ${plan}. Business Configuration Required.` },
      { status: 503 }
    );
  }

  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      customer_notify: 1,
      total_count: 100, // Razorpay requires a finite cycle count; 100 monthly cycles (~8 years) is the standard way integrations express "renews indefinitely" rather than silently lapsing after a year.
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return NextResponse.json(
      { ok: false, reason: `Razorpay rejected the subscription request: ${errorBody || response.statusText}` },
      { status: 502 }
    );
  }

  const subscription = await response.json();
  return NextResponse.json({ ok: true, subscriptionId: subscription.id, keyId: credentials.keyId });
}
