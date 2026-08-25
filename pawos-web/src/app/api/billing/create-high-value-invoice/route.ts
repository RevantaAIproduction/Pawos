import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials, razorpayAuthHeader } from "@/lib/billing/razorpay";
import { sendInvoiceEmail } from "@/lib/mail/invoiceMailer";

/**
 * Creates Razorpay invoice(s) for high-value Team/Enterprise orders (>₹5,00,000).
 * Splits large invoices to comply with Razorpay limits:
 * - ≤₹5,00,000 → 1 invoice
 * - ₹5,00,001–₹10,00,000 → 2 invoices
 * - ₹10,00,001–₹15,00,000 → 3 invoices
 * - ₹15,00,001–₹19,13,000 → up to 4 invoices
 * - >₹19,13,000 → rejected
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : undefined;
  const billingEmail = typeof body?.billingEmail === "string" ? body.billingEmail : undefined;
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName : undefined;
  const amountInr = typeof body?.amountInr === "number" ? body.amountInr : undefined;
  const description = typeof body?.description === "string" ? body.description : undefined;
  const gstPercent = typeof body?.gstPercent === "number" ? body.gstPercent : undefined;
  const billingCaseId = typeof body?.billingCaseId === "string" ? body.billingCaseId : undefined;

  if (!accessToken || !organizationId || !billingEmail || !amountInr || !description) {
    return NextResponse.json(
      { ok: false, reason: "Missing required fields." },
      { status: 400 }
    );
  }

  // Verify user is authenticated and is a member of the organization
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, reason: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const authClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, reason: "Invalid or expired session." },
      { status: 401 }
    );
  }
  const userId = userData.user.id;

  // Verify membership
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
    return NextResponse.json(
      { ok: false, reason: "You are not an active member of that organization." },
      { status: 403 }
    );
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, reason: "Payment processing is not configured." },
      { status: 503 }
    );
  }

  // Calculate invoice split
  const invoiceCount = calculateInvoiceCount(amountInr);
  if (invoiceCount === 0) {
    return NextResponse.json(
      { ok: false, reason: `Amount exceeds maximum allowed (₹19,13,000). Contact sales for larger orders.` },
      { status: 400 }
    );
  }

  const amountPerInvoice = Math.ceil(amountInr / invoiceCount);
  const invoices: Array<{ id: string; amount: number; url: string }> = [];

  // Create invoices
  for (let i = 0; i < invoiceCount; i++) {
    const isLastInvoice = i === invoiceCount - 1;
    const invoiceAmount = isLastInvoice
      ? amountInr - amountPerInvoice * (invoiceCount - 1)
      : amountPerInvoice;

    const invoiceBody = {
      customer_notifications: 1,
      email_notify: 1,
      sms_notify: 0,
      expire_by: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      description: `${description} (Invoice ${i + 1} of ${invoiceCount})`,
      amount: invoiceAmount * 100, // Razorpay expects paise
      currency: "INR",
      customer_details: {
        email: billingEmail,
        contact: "",
      },
      line_items: [
        {
          item_code: "high-value-order",
          description: description,
          amount: invoiceAmount * 100,
          currency: "INR",
          quantity: 1,
        },
      ],
      notes: {
        organizationId,
        organizationName: organizationName || "",
        invoiceNumber: `${i + 1}/${invoiceCount}`,
        gstPercent: gstPercent ? String(gstPercent) : "",
      },
    };

    try {
      const response = await fetch("https://api.razorpay.com/v1/invoices", {
        method: "POST",
        headers: {
          Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoiceBody),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return NextResponse.json(
          { ok: false, reason: `Failed to create invoice: ${errorBody || response.statusText}` },
          { status: 502 }
        );
      }

      const invoice = await response.json() as { id: string; short_url: string; amount: number };
      invoices.push({
        id: invoice.id,
        amount: invoiceAmount,
        url: invoice.short_url,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, reason: `Invoice creation failed: ${error instanceof Error ? error.message : String(error)}` },
        { status: 500 }
      );
    }
  }

  // Send invoice email to customer
  const emailResult = await sendInvoiceEmail(billingEmail, organizationName || "Your Organization", invoices, invoiceCount);
  if (!emailResult.ok) {
    console.warn(`[create-high-value-invoice] Invoice email failed for ${billingEmail}:`, emailResult.message);
    // Don't fail the request — invoices are created successfully; email is secondary
  }

  // Update billing case with invoice details if caseId provided
  if (billingCaseId) {
    const invoiceIds = invoices.map(inv => inv.id);
    const invoiceAmounts = invoices.map(inv => inv.amount);
    const invoiceUrls = invoices.map(inv => inv.url);
    const invoiceStatuses = invoices.map(() => 'issued');

    const dbClient = createSupabaseClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { error: updateError } = await dbClient
      .from("billing_cases")
      .update({
        invoice_ids: invoiceIds,
        invoice_amounts: invoiceAmounts,
        invoice_urls: invoiceUrls,
        invoice_statuses: invoiceStatuses,
        invoice_count: invoiceCount,
      })
      .eq("id", billingCaseId);

    if (updateError) {
      console.warn(`[create-high-value-invoice] Failed to update billing case ${billingCaseId}:`, updateError);
      // Don't fail the request — invoices are created; case update is secondary
    }
  }

  return NextResponse.json({
    ok: true,
    invoices,
    totalAmount: amountInr,
    organizationId,
    billingEmail,
    emailSent: emailResult.ok,
  });
}

function calculateInvoiceCount(amountInr: number): number {
  if (amountInr <= 500000) return 1;
  if (amountInr <= 1000000) return 2;
  if (amountInr <= 1500000) return 3;
  if (amountInr <= 1913000) return 4;
  return 0; // Over limit
}
