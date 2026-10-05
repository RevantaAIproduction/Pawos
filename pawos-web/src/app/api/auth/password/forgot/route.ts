import { NextResponse } from "next/server";
import { createServiceClient } from "../../../../../lib/supabase/serviceClient";
import { sendPasswordResetEmail } from "../../../../../lib/mail/accountMailer";

/**
 * POST /api/auth/password/forgot { email } — the "Reset your password" email, sent by PawOS (this
 * server's SMTP), not by Supabase. Supabase only makes the one-time link (admin generateLink,
 * which sends nothing); the link opens /reset-password to create the new password.
 *
 * Answers the same whether or not the account exists, so it can't be used to find out who has one.
 * The link always points at PawOS's own address — never at the request's Host header.
 */
const RESET_PAGE = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://pawos.revantaai.com").replace(/\/+$/, "")}/reset-password`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, number[]>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`email:${email}`, 3) || limited(`ip:${ip}`, 20)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Wait a few minutes and try again." }, { status: 429 });
  }

  const { data, error } = await createServiceClient().auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: RESET_PAGE } });
  const link = data?.properties?.action_link;
  // Logged (never shown) so a failure that silently sends nothing — e.g. Supabase refusing a link —
  // is visible in the server logs instead of looking like a sent email.
  if (error && !/not found/i.test(error.message)) console.error("[password-reset] generateLink failed:", error.message);
  if (!error && link) {
    const sent = await sendPasswordResetEmail(email, link);
    if (!sent) return NextResponse.json({ ok: false, error: "We couldn't send the email right now. Please try again." }, { status: 503 });
  }
  // No account (or no link): the same answer as a real send.
  return NextResponse.json({ ok: true });
}
