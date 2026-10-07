import { NextResponse } from "next/server";
import { DeviceAuthError, refreshClientSession } from "../../../../../lib/auth/deviceAuth";

/**
 * POST /api/auth/device/refresh { refreshToken } — renews a PawOS client's session, so a client
 * needs to know only PawOS's address (never the Supabase project's). The refresh token is the
 * credential; it is passed to Supabase for this one call and is neither stored nor logged.
 */
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { refreshToken?: unknown } | null;
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken : "";
  if (!refreshToken || refreshToken.length > 4096) {
    return NextResponse.json({ ok: false, code: "session_expired", message: "Your PawOS session has expired. Sign in again." }, { status: 401, headers: noStore });
  }
  try {
    return NextResponse.json({ ok: true, session: await refreshClientSession(refreshToken) }, { headers: noStore });
  } catch (error) {
    const failure = error instanceof DeviceAuthError ? error : new DeviceAuthError("unavailable", "Sign-in couldn't be reached. Please try again.", 503);
    return NextResponse.json({ ok: false, code: failure.code, message: failure.message }, { status: failure.status, headers: noStore });
  }
}
