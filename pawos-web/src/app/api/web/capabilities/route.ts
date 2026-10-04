import { NextResponse } from "next/server";
import { requireAccount } from "../../../../lib/account/api";
import { WEB_POLICY, resolveWebCapabilities, webMessageLimitFor } from "../../../../lib/webPolicy/webCapabilities";

/**
 * GET /api/web/capabilities — what the signed-in account may do on PawOS Web, as the server sees
 * it. For display only: each Web API route enforces its own capability again when it is called.
 */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  return NextResponse.json({
    ok: true,
    plan: { tier: guard.account.tier, label: guard.account.tierLabel },
    capabilities: resolveWebCapabilities(guard.account),
    limits: {
      webMessageLimit: webMessageLimitFor(guard.account),
      maxMessageChars: WEB_POLICY.maxMessageChars,
      maxAttachmentBytes: WEB_POLICY.maxAttachmentBytes,
    },
  });
}
