import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../lib/account/api";
import { ToolError, runConnectedTool, toolAvailability } from "../../../../lib/connectedTools/tools";
import { WebCapabilityError, webCapabilityStatus } from "../../../../lib/webPolicy/webCapabilities";

/**
 * Connected tools (lib/connectedTools/tools.ts).
 *
 *   GET  /api/web/tools                                  the tools, and which this account's plan includes
 *   POST /api/web/tools  { tool, args, confirmed? }      runs one; a write needs confirmed: true
 *
 * Signed-in accounts only (session cookie or bearer token). The plan, the provider's connector
 * entitlement and the account's own connection are checked on every call; the service's token is
 * read on the server and never returned.
 */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const status = webCapabilityStatus(guard.account, "web.connectedTools");
  return NextResponse.json({
    ok: true,
    available: status === "available",
    tools: toolAvailability(guard.account).map(({ tool, entitled, availableOn }) => ({ ...tool, entitled, availableOn })),
  });
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, code: "invalid_request", message: "Send { tool, args }." }, { status: 400 });
  try {
    const result = await runConnectedTool(guard.account, { tool: body.tool, args: body.args, confirmed: body.confirmed });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ToolError) return NextResponse.json({ ok: false, code: error.code, message: error.message, ...error.extra }, { status: error.status });
    if (error instanceof WebCapabilityError) return NextResponse.json({ ok: false, code: "capability_locked", message: error.message, capability: error.capability }, { status: 403 });
    console.error("[connected-tools] unexpected failure");
    return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
