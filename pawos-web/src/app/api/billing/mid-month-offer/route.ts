import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { calculateTicketBalanceInrPayment } from "@/lib/billing/razorpay";
import { getMidMonthOffer } from "@/lib/billing/midMonthPurchase";

/**
 * The mid-month purchase this signed-in user could buy right now — shown before checkout so the
 * customer sees the price, the PC it adds and the date it expires (the end of the current plan
 * period). Customer-facing values only.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  if (!accessToken) return NextResponse.json({ ok: false, reason: "Missing access token." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  const authClient = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });

  let offer;
  try {
    offer = await getMidMonthOffer(userData.user.id);
  } catch {
    return NextResponse.json({ ok: false, reason: "Extra usage is not available right now." }, { status: 503 });
  }
  if (!offer) {
    return NextResponse.json({ ok: true, available: false, reason: "Extra usage is available while you have an active Pro or Pro Max plan." });
  }
  const conversion = calculateTicketBalanceInrPayment(offer.priceCents / 100);
  return NextResponse.json({
    ok: true,
    available: true,
    label: offer.label,
    amountUsd: offer.priceCents / 100,
    amountInr: conversion?.amountInr ?? null,
    pc: offer.pc,
    expiresAt: offer.expiresAt,
  });
}
