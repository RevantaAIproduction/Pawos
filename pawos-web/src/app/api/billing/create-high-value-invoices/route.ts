import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials, razorpayAuthHeader, type SeatTier, type SubscriptionTierId } from "@/lib/billing/razorpay";

const VALID_TIERS: SubscriptionTierId[] = ["team", "enterprise"];
const VALID_SEAT_TIERS: SeatTier[] = ["standard", "premium"];

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

// Pricing in USD
const USD_PRICES: Record<SubscriptionTierId, number> = {
  go: 0,
  pro: 20,
  proMax: 100,
  team: 0,
  enterprise: 20,
};

const TEAM_SEAT_USD_PRICES: Record<SeatTier, number> = {
  standard: 20,
  premium: 100,
};

const USD_INR_RATE = 95.65;
const MAX_INVOICE_AMOUNT_INR = 500000; // ₹5,00,000 per invoice
const MAX_TOTAL_AMOUNT_INR = 1913000; // ₹19,13,000 (~$20,000)
const THRESHOLD_USD = 500; // >$500 triggers invoice flow

function calculateMonthlyAmountUsd(tier: SubscriptionTierId, seatTier?: SeatTier, seatCount = 1): number {
  if (tier === "team") {
    const seatPrice = TEAM_SEAT_USD_PRICES[seatTier ?? "standard"];
    return seatPrice * Math.max(1, seatCount);
  }
  if (tier === "enterprise") {
    return USD_PRICES.enterprise * Math.max(1, seatCount);
  }
  return 0;
}

function calculateMonthlyAmountInr(tier: SubscriptionTierId, seatTier?: SeatTier, seatCount = 1): number {
  const usd = calculateMonthlyAmountUsd(tier, seatTier, seatCount);
  return Math.round(usd * USD_INR_RATE);
}

interface InvoiceSplit {
  invoiceNumber: number;
  amountInr: number;
  amountUsd: number;
  amountPaise: number;
}

function calculateInvoiceSplits(totalAmountInr: number): InvoiceSplit[] {
  if (totalAmountInr <= MAX_INVOICE_AMOUNT_INR) {
    return [{
      invoiceNumber: 1,
      amountInr: totalAmountInr,
      amountUsd: Math.round(totalAmountInr / USD_INR_RATE * 100) / 100,
      amountPaise: totalAmountInr * 100,
    }];
  }

  const splits: InvoiceSplit[] = [];
  let remaining = totalAmountInr;
  let invoiceNumber = 1;

  while (remaining > 0 && invoiceNumber <= 4) {
    const amount = Math.min(remaining, MAX_INVOICE_AMOUNT_INR);
    splits.push({
      invoiceNumber,
      amountInr: amount,
      amountUsd: Math.round(amount / USD_INR_RATE * 100) / 100,
      amountPaise: amount * 100,
    });
    remaining -= amount;
    invoiceNumber++;
  }

  return splits;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const plan = body?.plan as SubscriptionTierId | undefined;
  const seatTier = body?.seatTier as SeatTier | undefined;
  const seatCount = typeof body?.seatCount === "number" && Number.isInteger(body.seatCount) ? body.seatCount : undefined;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  const customerName = typeof body?.customerName === "string" ? body.customerName : undefined;
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName : undefined;
  const gstNumber = typeof body?.gstNumber === "string" ? body.gstNumber : undefined;

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

  // ---- Plan validation ----
  if (!plan || !VALID_TIERS.includes(plan)) {
    return NextResponse.json({ ok: false, reason: "High-value invoices are only available for Team and Enterprise tiers." }, { status: 400 });
  }

  // ---- Email validation for Team/Enterprise ----
  if (isPersonalEmail(userEmail)) {
    return NextResponse.json(
      { ok: false, reason: "Team and Enterprise plans require a business or organization email address. Please use your organization email to continue." },
      { status: 403 }
    );
  }

  // ---- Team seat tier validation ----
  if (plan === "team") {
    if (!seatTier || !VALID_SEAT_TIERS.includes(seatTier)) {
      return NextResponse.json({ ok: false, reason: "Paw Team requires a seat tier: standard or premium." }, { status: 400 });
    }
  }

  // ---- Seat count validation ----
  if (!seatCount || seatCount < 1) {
    return NextResponse.json({ ok: false, reason: "Seat count must be at least 1." }, { status: 400 });
  }
  if (plan === "enterprise" && seatCount < 20) {
    return NextResponse.json({ ok: false, reason: "Enterprise requires a minimum of 20 seats." }, { status: 400 });
  }
  if (plan === "team" && seatCount > 150) {
    return NextResponse.json({ ok: false, reason: "Team tier supports a maximum of 150 seats." }, { status: 400 });
  }

  // ---- Customer information validation ----
  if (!customerName || !organizationName) {
    return NextResponse.json({ ok: false, reason: "Customer name and organization name are required for high-value invoices." }, { status: 400 });
  }

  // ---- Calculate amount ----
  const monthlyAmountInr = calculateMonthlyAmountInr(plan, seatTier, seatCount);
  const monthlyAmountUsd = calculateMonthlyAmountUsd(plan, seatTier, seatCount);

  // ---- Check if amount is within supported range ----
  if (monthlyAmountInr > MAX_TOTAL_AMOUNT_INR) {
    return NextResponse.json(
      { ok: false, reason: `The requested configuration exceeds the maximum supported amount of ₹${(MAX_TOTAL_AMOUNT_INR / 100000).toFixed(1)}L. Please contact our sales team.` },
      { status: 400 }
    );
  }

  // ---- Check threshold: if <= $500, should not be in invoice flow ----
  if (monthlyAmountUsd <= THRESHOLD_USD) {
    return NextResponse.json(
      { ok: false, reason: "This purchase amount qualifies for standard checkout. Please use the normal upgrade flow." },
      { status: 400 }
    );
  }

  // ---- Calculate invoice splits ----
  const invoiceSplits = calculateInvoiceSplits(monthlyAmountInr);

  // ---- Get Razorpay credentials ----
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json(
      { ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." },
      { status: 503 }
    );
  }

  // ---- Create Razorpay invoices ----
  const invoiceIds: string[] = [];
  const invoiceUrls: string[] = [];

  for (const split of invoiceSplits) {
    const invoicePayload = {
      entity_type: "subscription",
      amount: split.amountPaise,
      currency: "INR",
      description: `${customerName} - ${organizationName}`,
      customer_details: {
        name: customerName,
        email: userEmail,
      },
      notes: {
        organizationName,
        gstNumber: gstNumber || "",
        tier: plan,
        seatTier: plan === "team" ? seatTier : "N/A",
        seatCount: String(seatCount),
        invoiceNumber: String(split.invoiceNumber),
        totalInvoices: String(invoiceSplits.length),
        userId,
      },
    };

    const response = await fetch("https://api.razorpay.com/v1/invoices", {
      method: "POST",
      headers: {
        Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoicePayload),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return NextResponse.json(
        { ok: false, reason: `Failed to create invoice ${split.invoiceNumber}: ${errorBody || response.statusText}` },
        { status: 502 }
      );
    }

    const invoice = await response.json();
    invoiceIds.push(invoice.id);
    if (invoice.short_url) {
      invoiceUrls.push(invoice.short_url);
    }
  }

  return NextResponse.json({
    ok: true,
    plan,
    seatTier: plan === "team" ? seatTier : null,
    seatCount,
    monthlyAmountUsd,
    monthlyAmountInr,
    invoiceCount: invoiceSplits.length,
    invoices: invoiceSplits.map((split, idx) => ({
      number: split.invoiceNumber,
      amountInr: split.amountInr,
      amountUsd: split.amountUsd,
      invoiceId: invoiceIds[idx],
      invoiceUrl: invoiceUrls[idx],
    })),
    customerName,
    organizationName,
    gstNumber: gstNumber || null,
    keyId: credentials.keyId,
  });
}
