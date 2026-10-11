import { NextResponse } from "next/server";
import { isSameSiteOrigin } from "../../../../../lib/siteOrigin";
import { createClient } from "../../../../../lib/supabase/server";
import { isChallenge, isDeviceClient, issueDeviceHandoff } from "../../../../../lib/auth/deviceAuth";

/**
 * POST /api/auth/device/authorize { challenge, client } — the "Authorize" button on /auth/device.
 * Gives the signed-in browser user a one-time handoff, which the page shows as the completion
 * address to paste into the PawOS client that started the sign-in (see lib/auth/deviceAuth.ts).
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
  // The page that sent this must be PawOS's own: compared with the site's configured address, not
  // with a Host header the same request supplied.
  if (!origin || !isSameSiteOrigin(request, origin)) {
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
    const issued = issueDeviceHandoff(userId, body.challenge, body.client);
    return NextResponse.json({ ok: true, ...issued }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "unavailable", message: error instanceof Error ? error.message : "Please try again." }, { status: 503 });
  }
}
