import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import {
  DELETE_CODE_COOKIE,
  DELETE_CODE_COOKIE_PATH,
  DELETE_CODE_TTL_SECONDS,
  DeletionCheckError,
  findDeletionBlockers,
  issueDeleteCode,
} from "../../../../../lib/account/accountDeletion";
import { getRazorpayCredentials } from "../../../../../lib/billing/razorpay";
import { sendAccountDeleteCodeEmail } from "../../../../../lib/mail/accountMailer";
import { createServiceClient } from "../../../../../lib/supabase/serviceClient";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_CODES = 5;
const hits = new Map<string, number[]>();

function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CODES) return true;
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

/**
 * POST /api/dashboard/account/delete-code — step 1 of deleting the account (see accountDeletion.ts).
 * First checks what would block the deletion (money still owed, an owned organization) and, if
 * anything does, returns it instead of a code. Otherwise emails a 6-digit code to the account's own
 * address and sets an httpOnly cookie that proves it was issued to this user.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { user } = guard.account;
  if (!user.email) {
    return NextResponse.json({ ok: false, code: "no_email", message: "This account has no email address to confirm with. Contact pawos@revantaai.com." }, { status: 400 });
  }

  try {
    const blockers = await findDeletionBlockers(createServiceClient(), user.id, getRazorpayCredentials());
    if (blockers.length > 0) {
      return NextResponse.json({ ok: false, code: "blocked", message: "Your account can't be deleted yet.", blockers }, { status: 409 });
    }
  } catch (e) {
    if (!(e instanceof DeletionCheckError)) console.error("[account-delete] blocker check failed:", e);
    const message = e instanceof DeletionCheckError ? e.message : "Something went wrong.";
    return NextResponse.json({ ok: false, code: "check_failed", message: `${message} Your account wasn't changed. Please try again later.` }, { status: 503 });
  }

  if (limited(user.id)) {
    return NextResponse.json({ ok: false, code: "rate_limited", message: "Too many codes requested. Wait a few minutes and try again." }, { status: 429 });
  }

  const { code, cookieValue } = issueDeleteCode(user.id);
  if (!(await sendAccountDeleteCodeEmail(user.email, code))) {
    return NextResponse.json({ ok: false, code: "email_failed", message: "We couldn't send the code right now. Please try again." }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, email: user.email });
  response.cookies.set(DELETE_CODE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: DELETE_CODE_COOKIE_PATH,
    maxAge: DELETE_CODE_TTL_SECONDS,
  });
  return response;
}
