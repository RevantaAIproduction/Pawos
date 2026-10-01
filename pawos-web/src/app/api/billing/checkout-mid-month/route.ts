import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials, razorpayAuthHeader } from "@/lib/billing/razorpay";
import { buildMidMonthOrderPayload, getMidMonthOffer } from "@/lib/billing/midMonthPurchase";

/**
 * Creates the Razorpay Order for a mid-month purchase. The caller sends only its session: the
 * product, its fixed price and the plan period it extends are read from the database for this
 * user, and stamped into the order's notes, which verification trusts later.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  if (!accessToken) return NextResponse.json({ ok: false, reason: "Missing access token." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  const authClient = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
  const userId = userData.user.id;

  let offer;
  try {
    offer = await getMidMonthOffer(userId);
  } catch {
    return NextResponse.json({ ok: false, reason: "Extra usage is not available right now." }, { status: 503 });
  }
  if (!offer) {
    return NextResponse.json({ ok: false, reason: "Extra usage is available while you have an active Pro or Pro Max plan." }, { status: 409 });
  }

  const order = buildMidMonthOrderPayload(offer, userId);
  if (!order.ok) return NextResponse.json({ ok: false, reason: order.reason }, { status: 400 });

  const credentials = getRazorpayCredentials();
  if (!credentials) return NextResponse.json({ ok: false, reason: "Payment processing is not configured yet." }, { status: 503 });

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret), "Content-Type": "application/json" },
    body: JSON.stringify({ ...order.payload, receipt: `mid-month-${userId.slice(-8)}-${Date.now().toString().slice(-8)}` }),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return NextResponse.json({ ok: false, reason: `The payment processor rejected the order request: ${errorBody || response.statusText}` }, { status: 502 });
  }
  const created = await response.json();

  return NextResponse.json({
    ok: true,
    orderId: created.id,
    keyId: credentials.keyId,
    currency: "INR",
    amountUsd: order.amountUsd,
    amountInr: order.amountInr,
    amountPaise: order.amountPaise,
    usdInrRate: order.usdInrRate,
    label: offer.label,
    pc: offer.pc,
    expiresAt: offer.expiresAt,
  });
}
