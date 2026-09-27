import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getRazorpayCredentials,
  razorpayAuthHeader,
  getTicketBalanceUsdInrRate,
  getTicketPricingConfig,
  getUsageCreditsPricingConfig,
} from "@/lib/billing/razorpay";
import { sendInvoiceEmail } from "@/lib/mail/invoiceMailer";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { ONE_TIME_ORDER_LIMIT_INR, splitInvoiceShares, type InvoiceProductType } from "@/lib/billing/invoiceCrediting";

/** Largest total sold by invoice (4 invoices) — bigger orders go to sales. */
const MAX_INVOICED_TOTAL_INR = 1_913_000;
const PRODUCT_TYPES: InvoiceProductType[] = ["ticket_balance", "usage_credits", "tier_purchase"];

/**
 * Creates the Razorpay invoice(s) for a purchase above the ₹50,000 one-time order limit — Ticket Wallet
 * credits, usage credits, or a Team/Enterprise plan; for a personal account or an organization.
 * Each invoice is at most ₹5,00,000 (larger totals are split). The server computes every amount from
 * the USD total at the standard rate and stamps each invoice with the buyer (from their verified
 * session), the wallet, and that invoice's exact share — which is what lets the webhook credit it
 * automatically once paid (see lib/billing/invoiceCrediting.ts).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  const organizationId = typeof body?.organizationId === "string" && body.organizationId ? body.organizationId : undefined;
  const billingEmail = typeof body?.billingEmail === "string" ? body.billingEmail.trim() : undefined;
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName : undefined;
  const amountUsd = typeof body?.amountUsd === "number" ? body.amountUsd : undefined;
  const productType = PRODUCT_TYPES.includes(body?.productType) ? (body.productType as InvoiceProductType) : undefined;
  const description = typeof body?.description === "string" ? body.description : undefined;
  const gstPercent = typeof body?.gstPercent === "number" ? body.gstPercent : undefined;
  const billingCaseId = typeof body?.billingCaseId === "string" ? body.billingCaseId : undefined;

  if (!accessToken || !billingEmail || amountUsd === undefined || !productType || !description) {
    return NextResponse.json({ ok: false, reason: "Missing required fields." }, { status: 400 });
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ ok: false, reason: "Invalid amount." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  }
  const authClient = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
  }
  const userId = userData.user.id;

  // An organization purchase needs real, active membership; a personal purchase needs none.
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
  } else if (productType === "tier_purchase") {
    return NextResponse.json({ ok: false, reason: "Team and Enterprise plans are bought for an organization." }, { status: 400 });
  }

  if (productType !== "tier_purchase") {
    const { maxTopupUsd } = productType === "usage_credits" ? getUsageCreditsPricingConfig() : getTicketPricingConfig();
    if (amountUsd > maxTopupUsd) {
      return NextResponse.json({ ok: false, reason: `Maximum top-up is $${maxTopupUsd.toLocaleString()}.` }, { status: 400 });
    }
  }

  const usdInrRate = getTicketBalanceUsdInrRate();
  const shares = splitInvoiceShares(amountUsd, usdInrRate);
  const totalPaise = shares.reduce((sum, s) => sum + s.amountPaise, 0);
  const amountInr = totalPaise / 100;
  if (amountInr <= ONE_TIME_ORDER_LIMIT_INR) {
    return NextResponse.json(
      { ok: false, reason: `Purchases up to ₹${ONE_TIME_ORDER_LIMIT_INR.toLocaleString("en-IN")} use the normal checkout.` },
      { status: 400 }
    );
  }
  if (amountInr > MAX_INVOICED_TOTAL_INR) {
    return NextResponse.json({ ok: false, reason: "Amount exceeds maximum allowed (₹19,13,000). Contact sales for larger orders." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured." }, { status: 503 });
  }

  const invoices: Array<{ id: string; amount: number; url: string }> = [];
  for (let i = 0; i < shares.length; i++) {
    const share = shares[i]!;
    const label = shares.length > 1 ? `${description} (Invoice ${i + 1} of ${shares.length})` : description;
    const invoiceBody = {
      type: "invoice",
      customer_notifications: 1,
      email_notify: 1,
      sms_notify: 0,
      expire_by: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      description: label,
      currency: "INR",
      customer: { email: billingEmail, name: organizationName || billingEmail },
      line_items: [{ name: label, description, amount: share.amountPaise, currency: "INR", quantity: 1 }],
      notes: {
        productType,
        userId,
        organizationId: organizationId ?? "",
        organizationName: organizationName ?? "",
        amountUsd: share.amountUsd.toFixed(2),
        amountPaise: String(share.amountPaise),
        usdInrRate: String(usdInrRate),
        billingCaseId: billingCaseId ?? "",
        invoiceNumber: `${i + 1}/${shares.length}`,
        gstPercent: gstPercent ? String(gstPercent) : "",
      },
    };

    try {
      const response = await fetch("https://api.razorpay.com/v1/invoices", {
        method: "POST",
        headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret), "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody),
      });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return NextResponse.json({ ok: false, reason: `Failed to create invoice: ${errorBody || response.statusText}` }, { status: 502 });
      }
      const invoice = (await response.json()) as { id: string; short_url: string };
      invoices.push({ id: invoice.id, amount: share.amountPaise / 100, url: invoice.short_url });
    } catch (error) {
      return NextResponse.json(
        { ok: false, reason: `Invoice creation failed: ${error instanceof Error ? error.message : String(error)}` },
        { status: 500 }
      );
    }
  }

  const emailResult = await sendInvoiceEmail(billingEmail, organizationName || billingEmail, invoices, invoices.length);
  if (!emailResult.ok) {
    console.warn(`[create-high-value-invoice] Invoice email failed for ${billingEmail}:`, emailResult.message);
  }

  // Record the invoices on the buyer's own billing case (server-side; the case is theirs).
  if (billingCaseId) {
    try {
      const { error: updateError } = await createServiceClient()
        .from("billing_cases")
        .update({
          invoice_ids: invoices.map((inv) => inv.id),
          invoice_amounts: invoices.map((inv) => Math.round(inv.amount)),
          invoice_urls: invoices.map((inv) => inv.url),
          invoice_statuses: invoices.map(() => "issued"),
          invoice_count: invoices.length,
        })
        .eq("id", billingCaseId)
        .eq("user_id", userId);
      if (updateError) console.warn(`[create-high-value-invoice] Failed to update billing case ${billingCaseId}:`, updateError);
    } catch (error) {
      console.warn(`[create-high-value-invoice] Failed to update billing case ${billingCaseId}:`, error);
    }
  }

  return NextResponse.json({ ok: true, invoices, totalAmount: amountInr, organizationId: organizationId ?? null, billingEmail, emailSent: emailResult.ok });
}
