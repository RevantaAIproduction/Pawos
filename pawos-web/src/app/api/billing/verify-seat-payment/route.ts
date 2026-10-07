import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { applyVerifiedSeatPayment } from "@/lib/billing/seatPurchase";

/**
 * POST /api/billing/verify-seat-payment { accessToken, orderId, paymentId, signature }
 *
 * Verifies a seat payment with Razorpay and adds the seats to the organization recorded on the
 * order. The request names no organization, seat tier or quantity — those come from the order
 * PawOS created at checkout — and a payment adds its seats once, however often this is called.
 * See lib/billing/seatPurchase.ts.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { accessToken?: unknown; orderId?: unknown; paymentId?: unknown; signature?: unknown } | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  if (!accessToken || !orderId || !paymentId || !signature) {
    return NextResponse.json({ ok: false, reason: "Missing required payment verification fields." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ ok: false, reason: "Supabase is not configured. Business Configuration Required." }, { status: 503 });

  const authClient = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });

  const result = await applyVerifiedSeatPayment({ orderId, paymentId, signature, callerUserId: userData.user.id });
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason }, { status: result.status ?? 400 });
  return NextResponse.json({
    ok: true,
    applied: result.applied,
    organizationId: result.organizationId,
    seatTier: result.seatTier,
    seats: result.seats,
    seatCount: result.seatCount,
    paidPremiumSeats: result.paidPremiumSeats,
  });
}
