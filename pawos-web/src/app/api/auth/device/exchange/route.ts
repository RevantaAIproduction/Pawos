import { NextResponse } from "next/server";
import { DeviceAuthError, allowExchangeAttempt, consumeDeviceCode, createSessionForUser } from "../../../../../lib/auth/deviceAuth";

/**
 * POST /api/auth/device/exchange { code, verifier } — a PawOS client (CLI, VS Code) trades the
 * one-time code its user pasted for a session of its own (see lib/auth/deviceAuth.ts).
 *
 * The code works once, for a few minutes, and only together with the verifier of the client that
 * started the sign-in. Nothing is logged here: not the code, the verifier, or the session.
 */
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const caller = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowExchangeAttempt(caller)) {
    return NextResponse.json({ ok: false, code: "rate_limited", message: "Too many attempts. Wait a minute and try again." }, { status: 429, headers: noStore });
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown; verifier?: unknown } | null;
  const consumed = consumeDeviceCode(body?.code, body?.verifier);
  if (!consumed.ok) {
    const expired = consumed.reason === "expired";
    return NextResponse.json(
      { ok: false, code: expired ? "code_expired" : "invalid_code", message: expired ? "That code has expired. Start sign-in again." : "That code isn't valid. Check it and try again, or start sign-in again." },
      { status: 400, headers: noStore }
    );
  }
  try {
    const session = await createSessionForUser(consumed.userId);
    return NextResponse.json({ ok: true, session }, { headers: noStore });
  } catch (error) {
    const failure = error instanceof DeviceAuthError ? error : new DeviceAuthError("unavailable", "Sign-in couldn't be completed. Please try again.", 502);
    console.error(`[device-auth] could not create a session: ${failure.code}`);
    return NextResponse.json({ ok: false, code: failure.code, message: failure.message }, { status: failure.status, headers: noStore });
  }
}
