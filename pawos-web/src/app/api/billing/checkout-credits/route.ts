import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildTicketBalanceOrderPayload, getRazorpayCredentials, razorpayAuthHeader } from "@/lib/billing/razorpay";

/**
 * Creates a real Razorpay Order for a one-time Ticket Balance top-up — any dollar amount at or
 * above the real, editable minimum and at or below the real, editable maximum (see
 * getTicketPricingConfig()), enforced on every purchase (not just the first, since pawos-web has no
 * persistent account database to check purchase history against — see the webhook route's own
 * comment on why). The per-ticket rate this balance eventually buys is computed later, server-side,
 * at ticket-completion time in the Electron app's own get_ticket_unit_price() SQL function — this
 * route only ever validates and charges the raw top-up amount, never a credit count or a
 * price-per-ticket.
 *
 * Phase 2 (Razorpay payment verification) hardening: the caller's Supabase access token is now
 * required and verified server-side, and the resulting REAL, server-confirmed user id is stamped
 * into the order's own `notes` alongside amountUsd/organizationId. This closes a real, narrower gap:
 * without it, a leaked-but-real (orderId, paymentId, signature) triple could be replayed by ANY
 * signed-in session against /api/billing/credit-ticket-balance and credited to a different account
 * than the one that actually paid. The order's notes.userId is the one place a webhook (which has no
 * bearer token) can also resolve "who does this payment belong to".
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
  const orderPayload = buildTicketBalanceOrderPayload({ amountUsd, organizationId, userId });
  if (!orderPayload.ok) {
    return NextResponse.json({ ok: false, reason: orderPayload.reason }, { status: 400 });
  }

  // If ordering on behalf of an organization, confirm real active membership using the caller's OWN
  // token (RLS-scoped) rather than trusting the client's claim — mirrors credit-ticket-balance's own
  // membership check, applied here too so a forged organizationId can't even make it into the order
  // notes in the first place.
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
