import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildUsageCreditsOrderPayload, getRazorpayCredentials, razorpayAuthHeader } from "@/lib/billing/razorpay";

/**
 * Creates a Razorpay Order for a one-time Usage Credits top-up — minimum $5, maximum $20,000.
 * Usage Credits are distinct from Autonomous Work Credits (Ticket Balance):
 *  - Different product type: productType = "usage_credits" stamped in Razorpay order notes
 *  - Different minimum: $5 (vs $30 for Autonomous Work)
 *  - Different destination ledger: add_usage_credits_service RPC (vs add_ticket_balance_service)
 *
 * The server stamps productType = "usage_credits" at order creation time. The renderer cannot
 * change productType after this point — the webhook and credit-usage-credits route both read it
 * from the Razorpay order's own notes to route to the correct wallet.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const amountUsd = typeof body?.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : undefined;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : undefined;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;

  if (!accessToken) {
    return NextResponse.json({ ok: false, reason: "Missing access token." }, { status: 400 });
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

  if (typeof amountUsd !== "number") {
    return NextResponse.json({ ok: false, reason: "Enter a valid USD amount." }, { status: 400 });
  }

  const orderPayload = buildUsageCreditsOrderPayload({ amountUsd, organizationId, userId });
  if (!orderPayload.ok) {
    return NextResponse.json({ ok: false, reason: orderPayload.reason }, { status: 400 });
  }

  if (organizationId) {
    const membershipClient = createSupabaseClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: membership } = await membershipClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ ok: false, reason: "You are not an active member of that organization." }, { status: 403 });
    }
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." },
      { status: 503 }
    );
  }

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderPayload.payload),
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
    amountUsd: orderPayload.amountUsd,
    amountInr: orderPayload.amountInr,
    amountPaise: orderPayload.amountPaise,
    usdInrRate: orderPayload.usdInrRate,
    currency: "INR",
    keyId: credentials.keyId,
  });
}
