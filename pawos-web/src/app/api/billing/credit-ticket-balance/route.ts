import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { creditVerifiedTicketBalancePayment } from "@/lib/billing/ticketBalanceCrediting";

/**
 * P0-2 security fix, extended in Phase 2 — the server-side source of truth for crediting a Ticket
 * Balance top-up from the browser checkout flow.
 *
 * Previously, the Electron renderer credited the wallet directly by calling the (then
 * `authenticated`-grantable) add_ticket_balance() RPC with a client-supplied amount, triggered by an
 * unauthenticated ping to a local loopback server that itself trusted client-supplied query params —
 * see CheckoutSyncServer.ts and the production audit finding this closes. A compromised/modified
 * client (or a script in Electron's own devtools) could call that RPC directly with an arbitrary
 * amount and no proof any payment ever happened.
 *
 * This route is now the ONLY browser-triggered path that can credit a real Ticket Balance top-up
 * (the underlying RPC is service-role-only — see the 20260814000000 migration; the webhook is the
 * other, independent crediting path — see /api/billing/webhook). It:
 *   1. Verifies the caller's Supabase access token to get a REAL, server-confirmed user id — never
 *      trusts a client-supplied user/organization id without this.
 *   2. Delegates all Razorpay signature/payment/order verification and the actual RPC call to the
 *      shared creditVerifiedTicketBalancePayment() helper (Phase 2 — no longer duplicated between
 *      this route and the webhook).
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

  // Step 1: verify the caller's Supabase session — a real, server-confirmed user id, never a
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

  // Step 2: real Razorpay verification + idempotent crediting, including the "does this payment
  // actually belong to this caller" cross-check against the order's own notes.
  const result = await creditVerifiedTicketBalancePayment({
    orderId,
    paymentId,
    signature,
    identity: { source: "callerToken", userId, organizationId },
  });

  return NextResponse.json(
    result.ok ? { ok: true, amountUsd: result.amountUsd, topupId: result.topupId } : { ok: false, reason: result.reason },
    { status: result.ok ? 200 : (result.status ?? 400) }
  );
}
