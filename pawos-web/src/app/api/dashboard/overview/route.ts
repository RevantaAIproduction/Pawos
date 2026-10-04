import { NextResponse } from "next/server";
import { requireAccount } from "../../../../lib/account/api";
import { listIntegrations } from "../../../../lib/account/integrations";
import { getMyProfile } from "../../../../lib/account/profile";
import { getCompanion } from "../../../../lib/account/companionCatalog";
import { getUsageOverview } from "../../../../lib/account/usage";

/**
 * GET /api/dashboard/overview — the signed-in account's plan, usage, Companion and connection
 * summary. Requires a session; every value is resolved server-side for that session's user.
 */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { account } = guard;

  const [usage, integrations, profile] = await Promise.all([
    getUsageOverview(account),
    listIntegrations(account).catch(() => null),
    getMyProfile(account.supabase).catch(() => null),
  ]);
  const companion = profile ? getCompanion(profile.companionId) : undefined;

  return NextResponse.json({
    ok: true,
    plan: { tier: account.tier, label: account.tierLabel, proMaxVariant: account.proMaxVariant, expiresAt: account.subscriptionExpiresAt },
    usage,
    companion: profile
      ? { companionId: profile.companionId, displayName: companion?.displayName ?? profile.customCompanionName, custom: profile.companionId === null }
      : null,
    integrations: integrations
      ? {
          connected: integrations.filter((i) => i.connection === "connected").map((i) => i.id),
          available: integrations.filter((i) => i.entitled).length,
          total: integrations.length,
        }
      : null,
  });
}
