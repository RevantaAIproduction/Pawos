import { NextResponse } from "next/server";
import { consumeDesktopSignIn } from "../../../../../lib/desktopSignIn";

/**
 * POST /api/auth/desktop/consume — PawOS Desktop trades the code from pawos://web-auth-callback and
 * its own verifier for the one-time sign-in token, exactly once (lib/desktopSignIn.ts). Called by
 * the app's main process, not a browser.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: unknown; verifier?: unknown } | null;
  const result = consumeDesktopSignIn(body?.code, body?.verifier);
  if (!result) {
    return NextResponse.json({ ok: false, code: "expired", message: "This sign-in has expired. Try again from PawOS Desktop." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, tokenHash: result.tokenHash, email: result.email }, { headers: { "Cache-Control": "no-store" } });
}
