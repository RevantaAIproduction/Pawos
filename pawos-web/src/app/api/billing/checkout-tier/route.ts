import { NextResponse } from "next/server";
import { getRazorpayCredentials, razorpayAuthHeader, type SeatTier, type SubscriptionTierId, type ProMaxVariant } from "@/lib/billing/razorpay";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const VALID_TIERS: SubscriptionTierId[] = ["pro", "proMax", "team", "enterprise"];
const VALID_SEAT_TIERS: SeatTier[] = ["standard", "premium"];

/**
 * Organization plan pricing in INR paise (1 INR = 100 paise) for one-time orders. Pro / Pro Max are
 * not here — they're Razorpay subscriptions priced by their Razorpay plans (/api/billing/checkout).
 */
const TIER_PRICING_PAISE: Record<"team" | "enterprise", Record<string, number>> = {
  team: {
    standard: 191300, // ₹1,913 per seat
    premium: 956500, // ₹9,565 per seat
  },
  enterprise: {
    base: 1000000, // ₹10,000 base per seat
  },
};

/**
 * Creates a Razorpay Order for an organization plan purchase (Team / Enterprise — one-time order).
 * Pro and Pro Max are refused: they're subscriptions (/api/billing/checkout).
 * Team/Enterprise with seat counts multiply the base price by seat count.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tier = body?.tier as SubscriptionTierId | undefined;

  // Extract options from the nested options object (from IPC handler)
  const options = body?.options as Record<string, unknown> | undefined;
  const seatTier = options?.seatTier as SeatTier | undefined ?? body?.seatTier as SeatTier | undefined;
  const seatCount = typeof (options?.seatCount ?? body?.seatCount) === "number" && Number.isInteger(options?.seatCount ?? body?.seatCount) ? (options?.seatCount ?? body?.seatCount) : undefined;
  const runtimeIds = Array.isArray(options?.runtimeIds) ? options.runtimeIds : (Array.isArray(body?.runtimeIds) ? body.runtimeIds : []);
  const proMaxVariant = (options?.proMaxVariant ?? body?.proMaxVariant) as ProMaxVariant | undefined;
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

  // ---- Tier validation ----
  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ ok: false, reason: "Unknown tier requested." }, { status: 400 });
  }

  // ---- Pro / Pro Max are subscriptions, never one-time orders ----
  // They go through /api/billing/checkout (a Razorpay subscription that renews and is recorded in
  // pawos_subscriptions). A one-time order here would charge the customer without activating anything.
  if (tier === "pro" || tier === "proMax") {
    return NextResponse.json(
      { ok: false, reason: "Pro and Pro Max are subscriptions — please update PawOS and try again." },
      { status: 400 }
    );
  }

  // ---- Commercial Availability Gate for V1 Launch ----
  if ((tier as string) === "team" || (tier as string) === "enterprise") {
    return NextResponse.json(
      { ok: false, reason: "This tier is coming soon." },
      { status: 503 } // or 400
    );
  }

  // ---- Tier-specific parameter validation ----
  if (tier === "team") {
    if (!seatTier || !VALID_SEAT_TIERS.includes(seatTier)) {
      return NextResponse.json({ ok: false, reason: "Team requires a seat tier: standard or premium." }, { status: 400 });
    }
    if (seatCount === undefined || seatCount < 1) {
      return NextResponse.json({ ok: false, reason: "Seat count must be at least 1." }, { status: 400 });
    }
  }
  if (tier === "enterprise") {
    if (seatCount === undefined || seatCount < 20) {
      return NextResponse.json({ ok: false, reason: "Enterprise plans require a minimum of 20 seats." }, { status: 400 });
    }
  }
  // Runtime add-ons only come with Pro / Pro Max, which are subscriptions — never on an order here.
  if (runtimeIds.length > 0) {
    return NextResponse.json({ ok: false, reason: "Requested runtime is not available for purchase." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." },
      { status: 503 }
    );
  }

  // ---- Calculate order amount in INR rupees ----
  let amountInr: number | null = null;
  if (tier === "team" && seatTier && seatCount) {
    const basePaise = TIER_PRICING_PAISE.team[seatTier] ?? null;
    amountInr = basePaise ? (basePaise / 100) * seatCount : null;
  } else if (tier === "enterprise" && seatCount) {
    const basePaise = TIER_PRICING_PAISE.enterprise.base;
    amountInr = (basePaise / 100) * seatCount;
  }

  if (!amountInr || amountInr <= 0) {
    return NextResponse.json({ ok: false, reason: "Could not calculate order amount. Business Configuration Required." }, { status: 503 });
  }

  // Calculate amounts in different units for response
  const amountUsd = amountInr / 95.65; // Standard conversion rate (same as ticket balance)
  const usdInrRate = 95.65;

  // ---- Create Razorpay Order ----
  const authHeader = razorpayAuthHeader(credentials.keyId, credentials.keySecret);
  const amountPaise = Math.round(amountInr * 100);
  const requestBody = {
    amount: amountPaise,
    currency: "INR",
    receipt: `tier-${tier}-${userId.slice(-8)}-${Date.now().toString().slice(-8)}`,
    notes: {
      productType: "tier_purchase",
      tier,
      ...(seatTier ? { seatTier } : {}),
      ...(seatCount ? { seatCount } : {}),
      ...(proMaxVariant ? { proMaxVariant } : {}),
      runtimeIds: runtimeIds.length > 0 ? runtimeIds.join(",") : "",
      userId,
    },
  };

  console.log("[Razorpay DEBUG] Creating order with:");
  console.log("[Razorpay DEBUG] Key ID prefix:", credentials.keyId.substring(0, 15));
  console.log("[Razorpay DEBUG] Amount (paise):", amountPaise);
  console.log("[Razorpay DEBUG] Currency:", "INR");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.log("[Razorpay DEBUG] Response status:", response.status);
    console.log("[Razorpay DEBUG] Response body:", errorBody);
    return NextResponse.json(
      { ok: false, reason: `The payment processor rejected the order request: ${errorBody || response.statusText}` },
      { status: 502 }
    );
  }

  const order = await response.json();

  // Create Razorpay hosted checkout URL
  const checkoutUrl = `https://checkout.razorpay.com/?key=${credentials.keyId}&order_id=${order.id}&name=PawOS`;

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    keyId: credentials.keyId,
    checkoutUrl,
    amountUsd: Math.round(amountUsd * 100) / 100,
    amountInr: Math.round(amountInr),
    amountPaise,
    usdInrRate,
    currency: "INR",
  });
}
