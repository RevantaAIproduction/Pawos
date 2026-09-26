import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials, listRazorpayInvoices } from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

export type AccountInvoice = {
  id: string;
  /** Epoch ms — when it was paid, else issued. */
  date: number;
  /** In the smallest currency unit (paise for INR). */
  amount: number;
  currency: string;
  status: string;
  /** Razorpay's hosted invoice page (view / download), when there is one. */
  url: string | null;
};

/**
 * The signed-in account's subscription invoices (Pro / Pro Max), newest first, read live from
 * Razorpay. Which subscriptions belong to the caller comes from pawos_subscriptions (user_id is set
 * from the buyer's verified session at checkout) — nothing from the request body except the session
 * is trusted. Drafts and deleted invoices are left out.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  if (!accessToken) {
    return NextResponse.json({ ok: false, reason: "Missing access token." }, { status: 401 });
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

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured." }, { status: 503 });
  }

  const { data: rows, error } = await createServiceClient()
    .from("pawos_subscriptions")
    .select("id")
    .eq("user_id", userData.user.id);
  if (error) {
    return NextResponse.json({ ok: false, reason: "Could not read your subscriptions." }, { status: 502 });
  }

  const invoices: AccountInvoice[] = [];
  for (const { id: subscriptionId } of (rows ?? []) as { id: string }[]) {
    const items = await listRazorpayInvoices(credentials, subscriptionId);
    if (!items) {
      return NextResponse.json({ ok: false, reason: "Could not read invoices from Razorpay." }, { status: 502 });
    }
    for (const invoice of items) {
      if (invoice.subscription_id && invoice.subscription_id !== subscriptionId) continue;
      if (invoice.status === "draft" || invoice.status === "deleted") continue;
      const seconds = invoice.paid_at ?? invoice.issued_at ?? invoice.date ?? 0;
      invoices.push({
        id: invoice.id,
        date: seconds * 1000,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        url: invoice.short_url || null,
      });
    }
  }
  invoices.sort((a, b) => b.date - a.date);
  return NextResponse.json({ ok: true, invoices });
}
