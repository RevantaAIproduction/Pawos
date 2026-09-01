import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials } from "@/lib/billing/razorpay";
import crypto from "crypto";

/**
 * POST: Razorpay webhook for Enterprise pooled-credit settlement payment confirmation
 *
 * Handles payment.authorized, invoice.paid events for pooled-credit settlements.
 * Verifies Razorpay signature.
 * Processes idempotently using settlement_id.
 * Replenishes pool only after verified payment.
 */

function verifyRazorpaySignature(body: string, signature: string, keySecret: string): boolean {
  const hash = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
  return hash === signature;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ ok: false, reason: "Missing Razorpay signature." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Razorpay not configured." }, { status: 503 });
  }

  // Verify Razorpay signature
  if (!verifyRazorpaySignature(body, signature, credentials.keySecret)) {
    return NextResponse.json({ ok: false, reason: "Invalid Razorpay signature." }, { status: 401 });
  }

  const event = JSON.parse(body) as { event: string; payload?: { settlement_id?: string; payment?: { entity?: Record<string, unknown> & { notes?: Record<string, unknown> } }; invoice?: { entity?: Record<string, unknown> & { notes?: Record<string, unknown> } } } };
  const eventData = event.payload?.payment?.entity || event.payload?.invoice?.entity;

  if (!eventData) {
    return NextResponse.json({ ok: true, message: "Event processed but no relevant data." });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  try {
    const client = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Extract settlement_id from Razorpay notes
    const notes = eventData.notes || {};
    const settlementId = notes.settlement_id;

    if (!settlementId) {
      return NextResponse.json({
        ok: true,
        message: "Event processed but not a pooled-credit settlement.",
      });
    }

    // Find the settlement by ID (idempotency key)
    const { data: settlement, error: fetchError } = await client
      .from("enterprise_pooled_settlements")
      .select("*")
      .eq("settlement_id", settlementId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { ok: false, reason: "Failed to fetch settlement." },
        { status: 500 }
      );
    }

    if (!settlement) {
      return NextResponse.json({
        ok: true,
        message: "Settlement not found (idempotency: duplicate or invalid).",
      });
    }

    // If already paid, return success (idempotent)
    if (settlement.status === "paid") {
      return NextResponse.json({
        ok: true,
        message: "Settlement already marked paid (idempotent).",
      });
    }

    // For invoice payments: verify all invoices in the settlement are paid
    if (event.event === "invoice.paid") {
      const invoiceIds = settlement.razorpay_invoice_ids || [];
      const unpaidCount = invoiceIds.filter((id: string) => id !== eventData.id).length;

      // If there are other unpaid invoices, don't mark settlement as complete yet
      if (unpaidCount > 0) {
        return NextResponse.json({
          ok: true,
          message: `Invoice paid. ${unpaidCount} invoices remaining in settlement.`,
        });
      }
    }

    // Mark settlement as paid and replenish pool
    const { error: updateSettlementError } = await client
      .from("enterprise_pooled_settlements")
      .update({
        status: "paid",
        razorpay_payment_id: eventData.id,
        payment_verified_at: new Date().toISOString(),
      })
      .eq("settlement_id", settlementId);

    if (updateSettlementError) {
      return NextResponse.json({ ok: false, reason: "Failed to update settlement." }, { status: 500 });
    }

    // Replenish pool: clear consumed amount and reset settlement status
    const { error: replenishError } = await client
      .from("enterprise_pooled_credits")
      .update({
        pooled_credits_consumed: 0,
        settlement_status: "paid",
      })
      .eq("organization_id", settlement.organization_id);

    if (replenishError) {
      return NextResponse.json(
        { ok: false, reason: "Failed to replenish pool." },
        { status: 500 }
      );
    }

    // Log successful settlement
    console.log(`[Enterprise Settlement Confirmed] settlement_id: ${settlementId}, organization_id: ${settlement.organization_id}, amount: $${settlement.amount_usd}`);

    return NextResponse.json({
      ok: true,
      message: "Enterprise pooled-credit settlement confirmed and pool replenished.",
      organizationId: settlement.organization_id,
      amountUsd: settlement.amount_usd,
    });
  } catch (error) {
    console.error("[Enterprise Settlement Webhook Error]", error);
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 }
    );
  }
}
