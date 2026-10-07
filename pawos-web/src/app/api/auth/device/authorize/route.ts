import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { isChallenge, isDeviceClient, issueDeviceCode } from "../../../../../lib/auth/deviceAuth";

/**
 * POST /api/auth/device/authorize { challenge, client } — the "Authorize" button on /auth/device.
 * Gives the signed-in browser user a one-time code to paste into the PawOS client that opened the
 * page (see lib/auth/deviceAuth.ts).
 *
 * Browser sessions only: the caller must be signed in to PawOS Web by cookie, and the request must
 * come from a PawOS page (same-origin). A request carrying an Authorization header is refused — a
 * client that already holds a session cannot use it to sign in more clients.
 */
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== null) {
    return NextResponse.json({ ok: false, code: "forbidden", message: "Open this page in your browser to continue." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost || !host || originHost !== host) {
    return NextResponse.json({ ok: false, code: "forbidden", message: "Open this page in your browser to continue." }, { status: 403 });
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ ok: false, code: "not_authenticated", message: "Sign in to continue." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { challenge?: unknown; client?: unknown } | null;
  if (!isChallenge(body?.challenge) || !isDeviceClient(body?.client)) {
    return NextResponse.json({ ok: false, code: "invalid_request", message: "This sign-in link isn't valid. Start again from PawOS." }, { status: 400 });
  }
  try {
    const issued = issueDeviceCode(userId, body.challenge, body.client);
    return NextResponse.json({ ok: true, ...issued }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "unavailable", message: error instanceof Error ? error.message : "Please try again." }, { status: 503 });
  }
}
