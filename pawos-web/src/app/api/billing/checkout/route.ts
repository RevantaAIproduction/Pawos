import { NextResponse } from "next/server";
import { getRazorpayCredentials, getRazorpayPlanId, razorpayAuthHeader, type SeatTier, type SubscriptionTierId } from "@/lib/billing/razorpay";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const VALID_TIERS: SubscriptionTierId[] = ["go", "pro", "proMax", "team", "enterprise"];
const VALID_SEAT_TIERS: SeatTier[] = ["standard", "premium"];
const PURCHASABLE_RUNTIME_IDS = ["coding"] as const;
type PurchasableRuntimeId = (typeof PURCHASABLE_RUNTIME_IDS)[number];

/**
 * Creates a Razorpay subscription for the requested tier and returns the
 * subscription id + Razorpay key id the client needs to open Checkout.js.
 * Real Razorpay secrets never leave this route — the client only ever
 * receives the public key id (which Razorpay's own Checkout.js requires
 * client-side by design) and a subscription id, never the key secret.
 *
 * Team is seat-based with two rates (Standard/Premium) — a single Razorpay
 * subscription can't mix per-unit prices, so a Team org buying both seat
 * tiers makes two separate checkout calls (one per seat tier), each with
 * its own `quantity`. Enterprise's `quantity` is the seat count for its flat
 * base fee; its variable cost (Autonomous Engineering Task usage) is billed
 * separately through the existing success-gated usage system, not here.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const plan = body?.plan as SubscriptionTierId | undefined;
  const seatTier = body?.seatTier as SeatTier | undefined;
  const seatCount = typeof body?.seatCount === "number" && Number.isInteger(body.seatCount) ? body.seatCount : undefined;
  const runtimeIds = Array.isArray(body?.runtimeIds) ? body.runtimeIds : [];
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;

  // ---- Authentication ----
  if (!accessToken) {
    return NextResponse.json({ ok: false, reason: "Missing access token." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase is not configured. Business Configuration Required." }, { status: 503 });
  }
  const authClient = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
  }
  const userId = userData.user.id;

  // ---- Approval ----
  const { requestApproval } = await import("@/lib/billing/approvalHelper");
  const approved = await requestApproval(userId, `Create subscription for plan ${plan}${seatTier ? `, seat tier ${seatTier}` : ''}${seatCount ? `, ${seatCount} seats` : ''}`);
  if (!approved) {
    return NextResponse.json({ ok: false, reason: "User denied approval." }, { status: 403 });
  }

  if (!plan || !VALID_TIERS.includes(plan)) {
    return NextResponse.json({ ok: false, reason: "Unknown plan requested." }, { status: 400 });
  }
  if (plan === "go") {
    return NextResponse.json({ ok: false, reason: "Paw Go is free and has no checkout." }, { status: 400 });
  }
  if (plan === "team") {
    if (!seatTier || !VALID_SEAT_TIERS.includes(seatTier)) {
      return NextResponse.json({ ok: false, reason: "Paw Team requires a seat tier: standard or premium." }, { status: 400 });
    }
  }
  if ((plan === "team" || plan === "enterprise") && seatCount !== undefined && seatCount < 1) {
    return NextResponse.json({ ok: false, reason: "Seat count must be at least 1." }, { status: 400 });
  }
  if (
    runtimeIds.some((runtimeId: unknown): runtimeId is string => typeof runtimeId !== "string") ||
    runtimeIds.some((runtimeId: string) => !PURCHASABLE_RUNTIME_IDS.includes(runtimeId as PurchasableRuntimeId)) ||
    (runtimeIds.length > 0 && plan !== "pro" && plan !== "proMax")
  ) {
    return NextResponse.json({ ok: false, reason: "Requested runtime is not available for purchase." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." },
      { status: 503 }
    );
  }

  const planId = getRazorpayPlanId(plan, seatTier);
  if (!planId) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          plan === "team"
            ? `No payment plan is configured for Paw Team's ${seatTier} seat. Business Configuration Required.`
            : `No payment plan is configured for Paw ${plan}. Business Configuration Required.`,
      },
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
      ...((plan === "team" || plan === "enterprise") && seatCount ? { quantity: seatCount } : {}),
      // P0-3 security fix: runtimeIds round-trips through Razorpay's own notes field so
      // /api/billing/verify-subscription can read it back as real, Razorpay-attested data instead of
      // trusting whatever a forged local callback claims.
      ...(runtimeIds.length > 0 ? { notes: { runtimeIds: runtimeIds.join(",") } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return NextResponse.json(
      { ok: false, reason: `The payment processor rejected the subscription request: ${errorBody || response.statusText}` },
      { status: 502 }
    );
  }

  const subscription = await response.json();
  return NextResponse.json({ ok: true, subscriptionId: subscription.id, keyId: credentials.keyId });
}
