import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { creditVerifiedMidMonthPayment } from "@/lib/billing/midMonthPurchase";

/** Browser-callback verification of a mid-month purchase (the webhook is the independent backup). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  const orderId = typeof body?.orderId === "string" ? body.orderId : undefined;
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId : undefined;
  const signature = typeof body?.signature === "string" ? body.signature : undefined;
  if (!accessToken || !orderId || !paymentId || !signature) {
    return NextResponse.json({ ok: false, reason: "Missing required payment verification fields." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  const authClient = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });

  const result = await creditVerifiedMidMonthPayment({
    orderId,
    paymentId,
    signature,
    identity: { source: "callerToken", userId: userData.user.id },
  });
  return NextResponse.json(
    result.ok ? { ok: true, pc: result.pc, expiresAt: result.expiresAt } : { ok: false, reason: result.reason },
    { status: result.ok ? 200 : (result.status ?? 400) }
  );
}
