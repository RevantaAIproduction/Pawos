import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getRazorpayCredentials,
  verifyRazorpayOrderPaymentSignature,
  fetchRazorpayPayment,
} from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

/**
 * P0-2 security fix — the server-side source of truth for crediting a Ticket Balance top-up.
 *
 * Previously, the Electron renderer credited the wallet directly by calling the (then
 * `authenticated`-grantable) add_ticket_balance() RPC with a client-supplied amount, triggered by an
 * unauthenticated ping to a local loopback server that itself trusted client-supplied query params —
 * see CheckoutSyncServer.ts and the production audit finding this closes. A compromised/modified
 * client (or a script in Electron's own devtools) could call that RPC directly with an arbitrary
 * amount and no proof any payment ever happened.
 *
 * This route is now the ONLY path that can credit a real Ticket Balance top-up (the underlying RPC
 * is now service-role-only — see the 20260814000000 migration). It:
 *   1. Verifies the Razorpay payment signature server-side (proof only Razorpay's own backend,
 *      which holds key_secret, could have produced it — see verifyRazorpayOrderPaymentSignature).
 *   2. Re-fetches the payment from Razorpay's own API to confirm it is genuinely `captured`, belongs
 *      to the expected order, and to derive the REAL charged amount — never trusts a client-supplied
 *      amount at any point.
 *   3. Verifies the caller's Supabase access token to get a REAL, server-confirmed user id — never
 *      trusts a client-supplied user/organization id without this.
 *   4. Calls add_ticket_balance_service() with the service-role key, which is itself idempotent on
 *      razorpay_payment_id (a replayed call for the same real payment credits nothing a second time).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  const orderId = typeof body?.orderId === "string" ? body.orderId : undefined;
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId : undefined;
  const signature = typeof body?.signature === "string" ? body.signature : undefined;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : undefined;

  if (!accessToken || !orderId || !paymentId || !signature) {
    return NextResponse.json({ ok: false, reason: "Missing required payment verification fields." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured yet. Business Configuration Required." }, { status: 503 });
  }

  // Step 1: real cryptographic proof this exact (orderId, paymentId) pair was genuinely processed
  // by Razorpay — a forged pair without key_secret cannot produce a matching signature.
  if (!verifyRazorpayOrderPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return NextResponse.json({ ok: false, reason: "Invalid payment signature." }, { status: 400 });
  }

  // Step 2: re-derive the REAL amount/status from Razorpay's own API — never trust the client.
  const payment = await fetchRazorpayPayment(paymentId, credentials);
  if (!payment) {
    return NextResponse.json({ ok: false, reason: "Could not verify payment with Razorpay." }, { status: 502 });
  }
  if (payment.order_id !== orderId) {
    return NextResponse.json({ ok: false, reason: "Payment does not belong to the expected order." }, { status: 400 });
  }
  if (payment.status !== "captured") {
    return NextResponse.json({ ok: false, reason: `Payment is not captured (status: ${payment.status}).` }, { status: 400 });
  }
  if (payment.currency !== "USD") {
    return NextResponse.json({ ok: false, reason: `Unexpected currency: ${payment.currency}.` }, { status: 400 });
  }
  const amountUsd = payment.amount / 100;
  if (amountUsd < 30) {
    return NextResponse.json({ ok: false, reason: "Payment amount is below the minimum top-up." }, { status: 400 });
  }
  if (amountUsd > 20000) {
    return NextResponse.json({ ok: false, reason: "Payment amount exceeds the maximum top-up of $20,000." }, { status: 400 });
  }

  // Step 3: verify the caller's Supabase session — a real, server-confirmed user id, never a
  // client-supplied one.
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

  // If crediting an organization, confirm real active membership using the caller's OWN token
  // (RLS-scoped) rather than trusting the client's claim that it belongs to this org.
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

  // Step 4: credit — service-role only, idempotent on razorpay_payment_id.
  let serviceClient;
  try {
    serviceClient = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, reason: "Payment was verified, but crediting is not configured yet. Business Configuration Required." }, { status: 503 });
  }
  const { data: topupId, error: rpcError } = await serviceClient.rpc("add_ticket_balance_service", {
    p_user_id: organizationId ? null : userId,
    p_organization_id: organizationId ?? null,
    p_amount_usd: amountUsd,
    p_razorpay_payment_id: paymentId,
  });
  if (rpcError) {
    return NextResponse.json({ ok: false, reason: `Failed to credit balance: ${rpcError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, amountUsd, topupId });
}
