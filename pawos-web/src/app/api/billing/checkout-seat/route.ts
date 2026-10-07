import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials, razorpayAuthHeader } from "@/lib/billing/razorpay";
import { buildSeatOrder } from "@/lib/billing/seatPurchase";

/**
 * POST /api/billing/checkout-seat { accessToken, organizationId, seatTier, seats? }
 *
 * Creates the Razorpay order for more seats on a Paw Team organization. The caller must be signed
 * in and must manage that organization; the price is the server's, and the order's notes carry
 * the organization, buyer, seat tier and quantity that verification will later use. Nothing is
 * granted here — seats are added only by /api/billing/verify-seat-payment after the payment is
 * verified. See lib/billing/seatPurchase.ts.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { accessToken?: unknown; organizationId?: unknown; seatTier?: unknown; seats?: unknown } | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  if (!accessToken) return NextResponse.json({ ok: false, reason: "Missing access token." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ ok: false, reason: "Supabase is not configured. Business Configuration Required." }, { status: 503 });

  const callerClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
  const userId = userData.user.id;

  const order = await buildSeatOrder({ callerClient, userId, organizationId: body?.organizationId, seatTier: body?.seatTier, seats: body?.seats });
  if (!order.ok) return NextResponse.json({ ok: false, reason: order.reason }, { status: order.status });

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." }, { status: 503 });
  }

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret), "Content-Type": "application/json" },
    body: JSON.stringify({ ...order.payload, receipt: `seat-${userId.slice(-8)}-${Date.now().toString().slice(-8)}` }),
  });
  if (!response.ok) {
    console.error("[checkout-seat] Razorpay refused the order:", response.status);
    return NextResponse.json({ ok: false, reason: "The payment processor could not create the order. Please try again." }, { status: 502 });
  }
  const created = (await response.json()) as { id: string };

  return NextResponse.json({
    ok: true,
    orderId: created.id,
    checkoutUrl: `https://checkout.razorpay.com/?key=${credentials.keyId}&order_id=${created.id}&name=PawOS`,
    amountUsd: order.amountUsd,
    amountInr: order.amountInr,
    amountPaise: order.amountPaise,
    usdInrRate: order.usdInrRate,
    currency: "INR",
    keyId: credentials.keyId,
  });
}
