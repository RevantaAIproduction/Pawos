import { getRazorpayCredentials, razorpayAuthHeader } from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

/** Razorpay's single one-time order cap — anything above it is sold by invoice instead. */
export const ONE_TIME_ORDER_LIMIT_INR = 50_000;
/** Razorpay's cap for one invoice — larger amounts are split across several. */
export const INVOICE_LIMIT_INR = 500_000;

/** Which wallet a paid invoice tops up (server-stamped at invoice creation). */
export type InvoiceProductType = "ticket_balance" | "usage_credits" | "tier_purchase";

export type RazorpayInvoiceEntity = {
  id: string;
  status: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  payment_id?: string | null;
  notes?: Record<string, string> | null;
};

export interface CreditInvoiceResult {
  ok: boolean;
  /** 5xx = retry later (Razorpay retries the webhook); 4xx = permanent, never credit. */
  status?: number;
  reason?: string;
  amountUsd?: number;
  productType?: InvoiceProductType;
}

/**
 * Splits a high-value purchase into invoices of at most ₹5,00,000. The split is done in US cents so
 * the credited dollars add up exactly; each invoice's rupee amount is derived from its own share.
 */
export function splitInvoiceShares(amountUsd: number, usdInrRate: number): { amountUsd: number; amountPaise: number }[] {
  const totalCents = Math.round(amountUsd * 100);
  const totalInr = (totalCents / 100) * usdInrRate;
  const count = Math.max(1, Math.ceil(totalInr / INVOICE_LIMIT_INR));
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => {
    const cents = i === count - 1 ? totalCents - base * (count - 1) : base;
    return { amountUsd: cents / 100, amountPaise: Math.round(cents * usdInrRate) };
  });
}

export async function fetchRazorpayInvoice(
  invoiceId: string,
  credentials: { keyId: string; keySecret: string }
): Promise<RazorpayInvoiceEntity | null> {
  const response = await fetch(`https://api.razorpay.com/v1/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: { Authorization: razorpayAuthHeader(credentials.keyId, credentials.keySecret) },
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Credits a paid high-value invoice to the buyer's wallet — automatically, from the webhook.
 *
 * The event is only the trigger: the invoice is re-fetched from Razorpay's own API and must be fully
 * paid, in INR, for exactly the amount PawOS stamped on it. Who it's for and which wallet come from the
 * invoice's notes, which only PawOS's server can write (invoices are created with its secret key, from
 * the buyer's verified session). Crediting goes through the same service-role RPCs as every other top-up,
 * which are idempotent on the Razorpay payment id — a retried or duplicated event never credits twice.
 */
export async function creditPaidInvoice(invoiceId: string): Promise<CreditInvoiceResult> {
  const credentials = getRazorpayCredentials();
  if (!credentials) return { ok: false, status: 503, reason: "Payment processing is not configured." };

  const invoice = await fetchRazorpayInvoice(invoiceId, credentials);
  if (!invoice) return { ok: false, status: 502, reason: "Could not verify the invoice with Razorpay." };
  if (invoice.status !== "paid") return { ok: false, status: 400, reason: `Invoice is not paid (status: ${invoice.status}).` };
  if (invoice.currency !== "INR") return { ok: false, status: 400, reason: `Unexpected currency: ${invoice.currency}.` };
  if (invoice.amount_paid !== undefined && invoice.amount_paid !== invoice.amount) {
    return { ok: false, status: 400, reason: "Invoice was not paid in full." };
  }

  const notes = invoice.notes ?? {};
  const productType = notes.productType as InvoiceProductType | undefined;
  const userId = notes.userId ?? "";
  const organizationId = notes.organizationId ?? "";
  const amountUsd = Number(notes.amountUsd);
  const stampedPaise = Number(notes.amountPaise);
  if (!productType || !userId) return { ok: false, status: 400, reason: "Invoice was not created by PawOS checkout (no buyer recorded)." };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return { ok: false, status: 400, reason: "Invoice has no recorded USD amount." };
  if (stampedPaise !== invoice.amount) return { ok: false, status: 400, reason: "Invoice amount does not match what PawOS issued." };

  if (productType === "tier_purchase") {
    // Seats/plans are activated through the organization billing flow, not a wallet top-up.
    await markCaseInvoicePaid(notes.billingCaseId, invoice.id);
    return { ok: true, amountUsd, productType };
  }

  let serviceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return { ok: false, status: 503, reason: "Crediting is not configured." };
  }
  const rpc = productType === "usage_credits" ? "add_usage_credits_service" : "add_ticket_balance_service";
  const { error } = await serviceClient.rpc(rpc, {
    p_user_id: organizationId ? null : userId,
    p_organization_id: organizationId || null,
    p_amount_usd: amountUsd,
    p_razorpay_payment_id: invoice.payment_id || `invoice:${invoice.id}`,
  });
  if (error) return { ok: false, status: 500, reason: `Failed to credit balance: ${error.message}` };

  await markCaseInvoicePaid(notes.billingCaseId, invoice.id);
  return { ok: true, amountUsd, productType };
}

/** Records the paid invoice on its billing case; the case is 'received' once every invoice is paid. Never throws. */
async function markCaseInvoicePaid(caseId: string | undefined, invoiceId: string): Promise<void> {
  if (!caseId) return;
  try {
    const db = createServiceClient();
    const { data } = await db.from("billing_cases").select("invoice_ids, invoice_statuses").eq("id", caseId).maybeSingle();
    const ids: string[] = (data?.invoice_ids as string[] | null) ?? [];
    const index = ids.indexOf(invoiceId);
    if (index < 0) return;
    const statuses: string[] = [...((data?.invoice_statuses as string[] | null) ?? ids.map(() => "issued"))];
    statuses[index] = "paid";
    const allPaid = statuses.length === ids.length && statuses.every((s) => s === "paid");
    await db
      .from("billing_cases")
      .update({ invoice_statuses: statuses, razorpay_webhook_status: "processed", ...(allPaid ? { payment_status: "received" } : {}) })
      .eq("id", caseId);
  } catch (error) {
    console.warn(`[invoice-crediting] Could not update billing case ${caseId}:`, error);
  }
}
