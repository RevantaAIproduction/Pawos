import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getRazorpayCredentials, listRazorpaySubscriptions } from "@/lib/billing/razorpay";
import { recordRazorpaySubscription } from "@/lib/billing/subscriptionRecords";

/** Up to 20 pages × 100 subscriptions are scanned — ample for this business's volume. */
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

/**
 * "Restore purchases": records the signed-in user's own Pro / Pro Max subscriptions from Razorpay
 * into pawos_subscriptions. Needed for plans bought before the server kept plan records — the desktop
 * app calls this once when it holds a paid plan the server doesn't know about, then restores it from
 * the server like any other plan.
 *
 * Ownership comes from each subscription's Razorpay notes.userId, which /api/billing/checkout sets
 * server-side from the buyer's verified session — a caller can only ever restore subscriptions that
 * were bought by their own account. Nothing from the request body except the session is trusted.
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
  const userId = userData.user.id;

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured." }, { status: 503 });
  }

  let recorded = 0;
  let failed = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const items = await listRazorpaySubscriptions(credentials, { count: PAGE_SIZE, skip: page * PAGE_SIZE });
    if (!items) {
      return NextResponse.json({ ok: false, reason: "Could not read subscriptions from Razorpay." }, { status: 502 });
    }
    for (const subscription of items) {
      if (subscription.notes?.userId !== userId) continue;
      const result = await recordRazorpaySubscription(subscription, "restore-subscription");
      if (result === "recorded") recorded++;
      if (result === "failed") failed++;
    }
    if (items.length < PAGE_SIZE) break;
  }

  if (failed > 0) {
    return NextResponse.json({ ok: false, reason: "Some subscriptions could not be saved — try again.", recorded }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded });
}
