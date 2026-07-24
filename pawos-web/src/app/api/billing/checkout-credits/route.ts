import { NextResponse } from "next/server";
import { getRazorpayCredentials, razorpayAuthHeader, TASK_CREDIT_PRICE_USD, MIN_TASK_CREDIT_PURCHASE } from "@/lib/billing/razorpay";

/**
 * Creates a real Razorpay Order for a one-time prepaid Autonomous
 * Engineering Task credit purchase — $5/credit, minimum 6 credits ($30),
 * enforced on every purchase (not just the first, since pawos-web has no
 * persistent account database to check purchase history against — see
 * the webhook route's own comment on why). The order amount is always
 * computed server-side from `credits`, never trusted from the client
 * beyond the credit count itself.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const credits = typeof body?.credits === "number" && Number.isInteger(body.credits) ? body.credits : undefined;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : undefined;

  if (!credits || credits < MIN_TASK_CREDIT_PURCHASE) {
    return NextResponse.json(
      { ok: false, reason: `Minimum purchase is ${MIN_TASK_CREDIT_PURCHASE} task credits ($${MIN_TASK_CREDIT_PURCHASE * TASK_CREDIT_PRICE_USD}).` },
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

  const amountUsd = credits * TASK_CREDIT_PRICE_USD;
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountUsd * 100, // Razorpay amounts are in the smallest currency unit (cents for USD).
      currency: "USD",
      notes: { credits: String(credits), organizationId: organizationId ?? "" },
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
