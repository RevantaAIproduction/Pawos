import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { creditVerifiedUsageCreditsPayment } from "@/lib/billing/usageCreditsCrediting";

/**
 * Server-side source of truth for crediting a Usage Credits top-up from the browser checkout flow.
 * Structurally identical to /api/billing/credit-ticket-balance but routes to the Usage Credits
 * ledger (add_usage_credits_service) via creditVerifiedUsageCreditsPayment — never to the
 * Autonomous Work Credits wallet (add_ticket_balance_service).
 *
 * A successful Usage Credits payment must never call the Autonomous Work crediting function, and
 * vice versa — this route enforces the ledger separation at the API level.
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

  const result = await creditVerifiedUsageCreditsPayment({
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
