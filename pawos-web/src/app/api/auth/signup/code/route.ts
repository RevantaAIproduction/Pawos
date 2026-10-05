import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "../../../../../lib/supabase/serviceClient";
import { sendSignupCodeEmail } from "../../../../../lib/mail/accountMailer";

/**
 * POST /api/auth/signup/code { email, firstName, lastName } — step 2 of creating an account: a
 * 6-digit code, emailed by PawOS (this server's SMTP), not by Supabase. Supabase only makes the
 * one-time code (admin generateLink sends no email); the browser then checks it with
 * supabase.auth.verifyOtp({ type }) and sets the password (updateUser).
 *
 *  - A new email: the account is started with a random password nobody knows (replaced in step 3)
 *    and the code confirms the email ("signup").
 *  - An email that started signing up before but never finished: a fresh code ("email").
 *  - An email that already has an account: refused — log in instead.
 */
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

type Linked = { user?: { email_confirmed_at?: string | null; last_sign_in_at?: string | null } | null; properties?: { email_otp?: string } | null } | null;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; firstName?: unknown; lastName?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 100) : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim().slice(0, 100) : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  if (!firstName) return NextResponse.json({ ok: false, error: "Enter your first name." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`email:${email}`, 5) || limited(`ip:${ip}`, 20)) {
    return NextResponse.json({ ok: false, error: "Too many codes requested. Wait a few minutes and try again." }, { status: 429 });
  }

  const admin = createServiceClient().auth.admin;
  const fullName = `${firstName} ${lastName}`.trim();

  // A brand-new email: start the account (no email is sent by Supabase).
  const created = await admin.generateLink({
    type: "signup",
    email,
    password: randomBytes(32).toString("base64url"),
    options: { data: { full_name: fullName, first_name: firstName, last_name: lastName } },
  });
  let code = (created.data as Linked)?.properties?.email_otp;
  let verifyType: "signup" | "email" = "signup";

  if (created.error || !code) {
    // Already registered: finish an unfinished sign-up, or send them to log in.
    const existing = await admin.generateLink({ type: "magiclink", email });
    const linked = existing.data as Linked;
    const user = linked?.user;
    if (existing.error || !user) {
      console.error("[signup-code] could not start the account:", created.error?.code ?? created.error?.status ?? "unknown");
      return NextResponse.json({ ok: false, error: "We couldn't start your account. Please try again." }, { status: 500 });
    }
    if (user.email_confirmed_at && user.last_sign_in_at) {
      return NextResponse.json({ ok: false, code: "account_exists", error: "An account with this email already exists. Log in instead." }, { status: 409 });
    }
    code = linked?.properties?.email_otp;
    verifyType = "email";
  }
  if (!code) return NextResponse.json({ ok: false, error: "We couldn't make your code. Please try again." }, { status: 500 });

  if (!(await sendSignupCodeEmail(email, code))) {
    return NextResponse.json({ ok: false, error: "We couldn't send the email right now. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, verifyType });
}
