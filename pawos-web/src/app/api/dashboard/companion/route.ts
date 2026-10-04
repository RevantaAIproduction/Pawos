import { NextResponse } from "next/server";
import { errorResponse, rejectCrossOrigin, requireAccount } from "../../../../lib/account/api";
import { COMPANION_CATALOG, isCompanionAvailable } from "../../../../lib/account/companionCatalog";
import { getMyProfile, selectCompanion, type AccountProfile } from "../../../../lib/account/profile";
import type { AccountContext } from "../../../../lib/account/accountContext";

function companionPayload(account: AccountContext, profile: AccountProfile) {
  return {
    ok: true,
    current: { companionId: profile.companionId, customCompanionName: profile.customCompanionName, updatedAt: profile.companionUpdatedAt },
    catalog: COMPANION_CATALOG.map((entry) => ({ ...entry, available: isCompanionAvailable(entry, account.tier) })),
  };
}

/** GET /api/dashboard/companion — the Companion catalog and the account's current selection. */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(companionPayload(guard.account, await getMyProfile(guard.account.supabase)));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/dashboard/companion { companionId } — change the account's Companion. The id must be in
 * the catalog and the account's tier must hold the Companion's required feature; both are checked
 * server-side (and again by the database function) before the selection is stored.
 */
export async function PUT(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as { companionId?: unknown } | null;
  try {
    return NextResponse.json(companionPayload(guard.account, await selectCompanion(guard.account, body?.companionId)));
  } catch (error) {
    return errorResponse(error);
  }
}
