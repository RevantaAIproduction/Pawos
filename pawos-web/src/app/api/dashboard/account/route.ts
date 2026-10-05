import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rejectCrossOrigin, requireAccount } from "../../../../lib/account/api";
import {
  DELETE_CODE_COOKIE,
  DELETE_CODE_COOKIE_PATH,
  DeletionCheckError,
  deleteAccount,
  findDeletionBlockers,
  verifyDeleteCode,
} from "../../../../lib/account/accountDeletion";
import { getRazorpayCredentials } from "../../../../lib/billing/razorpay";
import { sendAccountDeletedEmail } from "../../../../lib/mail/accountMailer";
import { createServiceClient } from "../../../../lib/supabase/serviceClient";

/**
 * DELETE /api/dashboard/account { code, confirmEmail } — step 2: deletes the signed-in account.
 *
 * Needs the session, the emailed code (checked against the httpOnly cookie from step 1) and the
 * account's email typed back. A wrong code clears the cookie, so each code gets one try. The
 * blockers are checked again right here — a payment can fall due between step 1 and step 2 — and
 * the account is only deleted when nothing is owed (see accountDeletion.ts).
 */
export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { user, supabase } = guard.account;

  const body = (await request.json().catch(() => null)) as { code?: unknown; confirmEmail?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const confirmEmail = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";

  if (!user.email || confirmEmail !== user.email.toLowerCase()) {
    return NextResponse.json({ ok: false, code: "email_mismatch", message: "Type your account's email address exactly to confirm." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const verdict = verifyDeleteCode(user.id, code, cookieStore.get(DELETE_CODE_COOKIE)?.value);
  if (verdict !== "ok") {
    const response = NextResponse.json(
      { ok: false, code: verdict === "expired" ? "code_expired" : "code_invalid", message: verdict === "expired" ? "That code has expired. Send a new one." : "That code isn't right. Send a new code and try again." },
      { status: 400 }
    );
    response.cookies.set(DELETE_CODE_COOKIE, "", { path: DELETE_CODE_COOKIE_PATH, maxAge: 0 });
    return response;
  }

  const service = createServiceClient();
  const credentials = getRazorpayCredentials();
  try {
    const blockers = await findDeletionBlockers(service, user.id, credentials);
    if (blockers.length > 0) {
      return NextResponse.json({ ok: false, code: "blocked", message: "Your account can't be deleted yet.", blockers }, { status: 409 });
    }
    await deleteAccount(service, user.id, credentials);
  } catch (e) {
    if (!(e instanceof DeletionCheckError)) console.error("[account-delete] delete failed:", e);
    const message = e instanceof DeletionCheckError ? e.message : "Something went wrong.";
    return NextResponse.json({ ok: false, code: "delete_failed", message: `${message} Your account wasn't deleted. Please try again later.` }, { status: 503 });
  }

  await sendAccountDeletedEmail(user.email);
  // Clears this browser's session cookies; the user no longer exists, so a failure here is harmless.
  await supabase.auth.signOut().catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DELETE_CODE_COOKIE, "", { path: DELETE_CODE_COOKIE_PATH, maxAge: 0 });
  return response;
}
