import { NextResponse } from "next/server";
import { getRazorpayCredentials, razorpayAuthHeader, getTicketPricingConfig } from "@/lib/billing/razorpay";

/**
 * Creates a real Razorpay Order for a one-time Ticket Balance top-up — any dollar amount at or
 * above the real, editable minimum (see getTicketPricingConfig()), enforced on every purchase (not
 * just the first, since pawos-web has no persistent account database to check purchase history
 * against — see the webhook route's own comment on why). The per-ticket rate this balance
 * eventually buys is computed later, server-side, at ticket-completion time in the Electron app's
 * own get_ticket_unit_price() SQL function — this route only ever validates and charges the raw
 * top-up amount, never a credit count or a price-per-ticket.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const amountUsd = typeof body?.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : undefined;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : undefined;
  const { minTopupUsd } = getTicketPricingConfig();

  if (!amountUsd || amountUsd < minTopupUsd) {
    return NextResponse.json(
      { ok: false, reason: `Minimum top-up is $${minTopupUsd}.` },
      { status: 400 }
    );
  }
  // P0-2: server-side max enforcement, not merely a UI hint — the real, authoritative enforcement
  // happens again at crediting time (see /api/billing/credit-ticket-balance and the
  // add_ticket_balance_service() RPC), but rejecting an over-limit order at creation time is the
  // earliest, most honest place to say no.
  if (amountUsd > 20000) {
    return NextResponse.json(
      { ok: false, reason: "Maximum top-up is $20,000." },
      { status: 400 }
    );
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
    body: JSON.stringify({
      amount: Math.round(amountUsd * 100), // Razorpay amounts are in the smallest currency unit (cents for USD).
      currency: "USD",
      notes: { amountUsd: String(amountUsd), organizationId: organizationId ?? "" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    return NextResponse.json(
      { ok: false, reason: `Razorpay rejected the order request: ${errorBody || response.statusText}` },
      { status: 502 }
    );
  }

  const order = await response.json();
  return NextResponse.json({ ok: true, orderId: order.id, amountUsd, keyId: credentials.keyId });
}
