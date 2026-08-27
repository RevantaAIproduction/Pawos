import { NextResponse } from "next/server";
import { getRazorpayCredentials, razorpayAuthHeader, type SeatTier, type SubscriptionTierId, type ProMaxVariant } from "@/lib/billing/razorpay";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const VALID_TIERS: SubscriptionTierId[] = ["pro", "proMax", "team", "enterprise"];
const VALID_SEAT_TIERS: SeatTier[] = ["standard", "premium"];
const PURCHASABLE_RUNTIME_IDS = ["coding"] as const;
type PurchasableRuntimeId = (typeof PURCHASABLE_RUNTIME_IDS)[number];

// Personal/free email providers that require organization email for Team/Enterprise tiers
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "protonmail.com",
]);

function isPersonalEmail(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1];
  return domain ? PERSONAL_EMAIL_DOMAINS.has(domain) : false;
}

/**
 * Tier pricing in INR paise (1 INR = 100 paise).
 * These are monthly equivalents for now — displayed as one-time purchases to the user.
 * In the future, these can be moved to the database for editability.
 */
const TIER_PRICING_PAISE: Record<SubscriptionTierId, Record<string, number>> = {
  go: {},
  pro: {
    base: 150000, // ₹1,500
  },
  proMax: {
    "5x": 600000, // ₹6,000
    "20x": 1500000, // ₹15,000
  },
  team: {
    standard: 300000, // ₹3,000 per seat
    premium: 600000, // ₹6,000 per seat
  },
  enterprise: {
    base: 1000000, // ₹10,000 base per seat
  },
};

/**
 * Creates a Razorpay Order for a tier purchase (one-time payment, not subscription).
 * Returns the order ID which the client uses with createPayment().
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
  const userEmail = userData.user.email || "";

  // ---- Tier validation ----
  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ ok: false, reason: "Unknown tier requested." }, { status: 400 });
  }

  // ---- Email validation for Team/Enterprise ----
  if ((tier === "team" || tier === "enterprise") && isPersonalEmail(userEmail)) {
    return NextResponse.json(
      { ok: false, reason: "Team and Enterprise plans require a business or organization email address. Please use your organization email to continue." },
      { status: 403 }
    );
  }

  // ---- Tier-specific parameter validation ----
  if (tier === "proMax" && !proMaxVariant) {
    return NextResponse.json({ ok: false, reason: "Pro Max requires a variant: 5x or 20x." }, { status: 400 });
  }
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
  if (
    runtimeIds.some((runtimeId: unknown): runtimeId is string => typeof runtimeId !== "string") ||
    runtimeIds.some((runtimeId: string) => !PURCHASABLE_RUNTIME_IDS.includes(runtimeId as PurchasableRuntimeId)) ||
    (runtimeIds.length > 0 && tier !== "pro" && tier !== "proMax")
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

  // ---- Calculate order amount in paise ----
  let amountPaise: number | null = null;
  if (tier === "pro") {
    amountPaise = TIER_PRICING_PAISE.pro.base;
  } else if (tier === "proMax" && proMaxVariant) {
    amountPaise = TIER_PRICING_PAISE.proMax[proMaxVariant] ?? null;
  } else if (tier === "team" && seatTier && seatCount) {
    const basePaise = TIER_PRICING_PAISE.team[seatTier] ?? null;
    amountPaise = basePaise ? basePaise * seatCount : null;
  } else if (tier === "enterprise" && seatCount) {
    const basePaise = TIER_PRICING_PAISE.enterprise.base;
    amountPaise = basePaise * seatCount;
  }

  if (!amountPaise || amountPaise <= 0) {
    return NextResponse.json({ ok: false, reason: "Could not calculate order amount. Business Configuration Required." }, { status: 503 });
  }

  // Calculate amounts in different units for response
  const amountInr = amountPaise / 100;
  const amountUsd = amountInr / 95.65; // Standard conversion rate (same as ticket balance)
  const usdInrRate = 95.65;

  // ---- Create Razorpay Order ----
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `tier-${tier}-${userId}-${Date.now()}`,
      notes: {
        productType: "tier_purchase",
        tier,
        ...(seatTier ? { seatTier } : {}),
        ...(seatCount ? { seatCount } : {}),
        ...(proMaxVariant ? { proMaxVariant } : {}),
        runtimeIds: runtimeIds.length > 0 ? runtimeIds.join(",") : "",
        userId,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return NextResponse.json(
      { ok: false, reason: `The payment processor rejected the order request: ${errorBody || response.statusText}` },
      { status: 502 }
    );
  }

  const order = await response.json();
  return NextResponse.json({
    ok: true,
    orderId: order.id,
    keyId: credentials.keyId,
    amountUsd: Math.round(amountUsd * 100) / 100, // Round to 2 decimals
    amountInr: Math.round(amountInr * 100) / 100,
    amountPaise,
    usdInrRate,
    currency: "INR",
  });
}
