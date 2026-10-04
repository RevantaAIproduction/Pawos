import { NextResponse } from "next/server";
import { requireAccount } from "../../../../lib/account/api";
import { listIntegrations } from "../../../../lib/account/integrations";

/** GET /api/dashboard/integrations — supported connectors with this account's entitlement and connection state. */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, tier: guard.account.tierLabel, integrations: await listIntegrations(guard.account) });
  } catch {
    return NextResponse.json({ ok: false, code: "failed", message: "Could not load integrations." }, { status: 500 });
  }
}
