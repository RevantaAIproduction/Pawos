import { NextResponse } from "next/server";
import { DeviceAuthError, allowExchangeAttempt, consumeDeviceHandoff, createSessionForUser } from "../../../../../lib/auth/deviceAuth";

/**
 * POST /api/auth/device/exchange { handoff, verifier, client } — a PawOS client (CLI, VS Code)
 * trades the one-time handoff from the completion address its user pasted for a session of its own
 * (see lib/auth/deviceAuth.ts).
 *
 * The handoff works once, for a few minutes, only for the kind of client it was issued to, and
 * only together with the verifier of the client that started the sign-in. Nothing is logged here:
 * not the handoff, the verifier, or the session.
 */
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const caller = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowExchangeAttempt(caller)) {
    return NextResponse.json({ ok: false, code: "rate_limited", message: "Too many attempts. Wait a minute and try again." }, { status: 429, headers: noStore });
  }
  const body = (await request.json().catch(() => null)) as { handoff?: unknown; verifier?: unknown; client?: unknown } | null;
  const consumed = consumeDeviceHandoff(body?.handoff, body?.verifier, body?.client);
  if (!consumed.ok) {
    const expired = consumed.reason === "expired";
    return NextResponse.json(
      {
        ok: false,
        code: expired ? "handoff_expired" : "invalid_handoff",
        message: expired ? "That authentication URL has expired. Start sign-in again." : "That authentication URL isn't valid or has already been used. Start sign-in again.",
      },
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
