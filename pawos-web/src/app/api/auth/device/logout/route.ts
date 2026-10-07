import { NextResponse } from "next/server";
import { bearerTokenFrom } from "../../../../../lib/account/accountContext";
import { endClientSession } from "../../../../../lib/auth/deviceAuth";

/**
 * POST /api/auth/device/logout — ends the PawOS client session whose access token is in the
 * Authorization header, and only that session (the browser and other clients stay signed in).
 * Always answers ok: a client signs out locally whatever happens here.
 */
export async function POST(request: Request) {
  const token = bearerTokenFrom(request.headers.get("authorization") ?? "");
  if (token) await endClientSession(token).catch(() => undefined);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
