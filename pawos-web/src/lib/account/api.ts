import { NextResponse } from "next/server";
import { getAccountContext, type AccountContext } from "./accountContext";
import { ProfileError } from "./profile";

/**
 * Shared guards for /api/dashboard routes. Every route calls requireAccount() first: the account
 * comes from the session cookie and the database, so a signed-out request gets 401 before any
 * account data is read, and nothing in the request body can name a different user, tier or role.
 */

export type AccountGuard = { ok: true; account: AccountContext } | { ok: false; response: NextResponse };

export async function requireAccount(): Promise<AccountGuard> {
  const account = await getAccountContext();
  if (!account) {
    return { ok: false, response: NextResponse.json({ ok: false, code: "not_authenticated", message: "Sign in to continue." }, { status: 401 }) };
  }
  return { ok: true, account };
}

/**
 * Rejects a state-changing request that a different site caused the browser to send. Browsers
 * attach Origin to cross-site POST/PUT/DELETE; a request with no Origin (a non-browser client)
 * still needs the session cookie and is unaffected.
 */
export function rejectCrossOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (host && originHost === host) return null;
  return NextResponse.json({ ok: false, code: "forbidden", message: "Cross-origin request rejected." }, { status: 403 });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ProfileError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }
  return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
}
