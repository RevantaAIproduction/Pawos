import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { TIER_LABELS, type AccountTier } from "./entitlements";

/**
 * Who is making this request and what their account is entitled to — resolved on the server from
 * the session cookie and the database, for every dashboard page and /api/dashboard route. Nothing
 * here is ever taken from the request body, query string or headers the browser controls: not the
 * user id, not the organization, not the tier, not the role.
 *
 * Tier sources, all existing server-side records (no new billing state):
 *  - PawOS Build: get_my_build_access() — an active admin grant overrides the subscription tier.
 *  - Team / Enterprise: an active organization_members row, tier from organizations.tier.
 *  - Pro / Pro Max: get_my_subscription() (Razorpay-backed pawos_subscriptions).
 *  - Otherwise Paw Go.
 */

export interface AccountOrganization {
  id: string;
  name: string;
  tier: "team" | "enterprise";
  role: string;
}

export interface AccountContext {
  supabase: SupabaseClient;
  user: User;
  displayName: string;
  avatarUrl: string | null;
  tier: AccountTier;
  tierLabel: string;
  /** Only for Pro Max: "5x" or "20x". */
  proMaxVariant: string | null;
  /** When the paid subscription period ends, ISO string. */
  subscriptionExpiresAt: string | null;
  /** Active memberships only — an invited or removed member is not in this list. */
  organizations: AccountOrganization[];
}

export function accountDisplayName(user: Pick<User, "email" | "user_metadata">): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return (
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.user_name === "string" && meta.user_name) ||
    user.email ||
    "PawOS user"
  );
}

export function accountAvatarUrl(user: Pick<User, "user_metadata">): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return (typeof meta.avatar_url === "string" && meta.avatar_url) || (typeof meta.picture === "string" && meta.picture) || null;
}

const TIER_RANK: Record<AccountTier, number> = { go: 0, build: 0, pro: 1, proMax: 2, team: 3, enterprise: 4 };

type OrganizationRow = { role: string; organizations: { id: string; name: string; tier: string } | { id: string; name: string; tier: string }[] | null };

/** Resolves the account from an already-authenticated Supabase client. Exported for tests. */
export async function resolveAccountContext(supabase: SupabaseClient, user: User): Promise<AccountContext> {
  const [subscriptionResult, buildResult, membershipResult] = await Promise.all([
    supabase.rpc("get_my_subscription"),
    supabase.rpc("get_my_build_access"),
    supabase.from("organization_members").select("role, organizations(id, name, tier)").eq("user_id", user.id).eq("status", "active"),
  ]);

  const subscription = (subscriptionResult.data ?? null) as { active?: boolean; tier?: string; proMaxVariant?: string | null; expiresAt?: string | null } | null;
  const build = (buildResult.data ?? null) as { status?: string } | null;

  const organizations: AccountOrganization[] = [];
  for (const row of (membershipResult.data ?? []) as OrganizationRow[]) {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (org && (org.tier === "team" || org.tier === "enterprise")) {
      organizations.push({ id: org.id, name: org.name, tier: org.tier, role: row.role });
    }
  }

  let tier: AccountTier = "go";
  if (subscription?.active && (subscription.tier === "pro" || subscription.tier === "proMax")) tier = subscription.tier;
  for (const org of organizations) {
    if (TIER_RANK[org.tier] > TIER_RANK[tier]) tier = org.tier;
  }
  // An active Build grant governs entitlements while it lasts, exactly as on the desktop
  // (EffectiveTierId in src/shared/billing/BillingTypes.ts).
  if (build?.status === "active") tier = "build";

  return {
    supabase,
    user,
    displayName: accountDisplayName(user),
    avatarUrl: accountAvatarUrl(user),
    tier,
    tierLabel: TIER_LABELS[tier],
    proMaxVariant: tier === "proMax" ? (subscription?.proMaxVariant ?? null) : null,
    subscriptionExpiresAt: subscription?.active ? (subscription.expiresAt ?? null) : null,
    organizations,
  };
}

/**
 * The signed-in account for this request, or null when nobody is signed in. Wrapped in React's
 * per-request cache so the dashboard layout and the page it renders resolve the account once.
 */
export const getAccountContext = cache(async (): Promise<AccountContext | null> => {
  let supabase: SupabaseClient;
  try {
    supabase = await createClient();
  } catch {
    return null; // Supabase not configured (local dev without env vars)
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return resolveAccountContext(supabase, user);
});
