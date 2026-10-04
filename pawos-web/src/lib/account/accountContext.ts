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
 * One tier per account, resolved exactly as PawOS Desktop resolves it (EntitlementService
 * baseTier() / effectiveTier()), so a plan bought on either surface is the same plan on both.
 * Tier sources, all existing server-side records (no new billing state):
 *  - Team / Enterprise: an active organization_members row, tier from organizations.tier.
 *  - Pro / Pro Max: get_my_subscription() (Razorpay-backed pawos_subscriptions).
 *  - Internal test accounts only: an admin_test_tier_overrides row replaces the tier above, as on
 *    Desktop (TestTierOverrideStore).
 *  - PawOS Build: get_my_build_access() — an active grant applies only when the account would
 *    otherwise be on Paw Go; a paid plan always wins over it, as on Desktop.
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

/** The internal accounts PawOS Desktop lets test other tiers (TestTierOverrideStore.AUTHORIZED_ADMINS). */
const TEST_TIER_ACCOUNTS = new Set(["tharun@revantaai.com", "founder@revantaai.com", "pawos@revantaai.com"]);
const OVERRIDE_TIERS: readonly AccountTier[] = ["go", "pro", "proMax", "team", "enterprise"];

/** The internal test-tier override, read as Desktop reads it (the account's own row, no organization). */
async function testTierOverride(supabase: SupabaseClient, user: User): Promise<AccountTier | null> {
  if (!user.email || !TEST_TIER_ACCOUNTS.has(user.email.toLowerCase())) return null;
  const { data, error } = await supabase.from("admin_test_tier_overrides").select("override_tier").eq("user_id", user.id).is("organization_id", null).maybeSingle();
  if (error) return null;
  const tier = (data as { override_tier?: string } | null)?.override_tier;
  return OVERRIDE_TIERS.includes(tier as AccountTier) ? (tier as AccountTier) : null;
}

type OrganizationRow = { role: string; organizations: { id: string; name: string; tier: string } | { id: string; name: string; tier: string }[] | null };

/** Resolves the account from an already-authenticated Supabase client. Exported for tests. */
export async function resolveAccountContext(supabase: SupabaseClient, user: User): Promise<AccountContext> {
  const [subscriptionResult, buildResult, membershipResult, override] = await Promise.all([
    supabase.rpc("get_my_subscription"),
    supabase.rpc("get_my_build_access"),
    supabase.from("organization_members").select("role, organizations(id, name, tier)").eq("user_id", user.id).eq("status", "active"),
    testTierOverride(supabase, user),
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
  // Internal test accounts: the override replaces the tier, as Desktop's baseTier() does.
  if (override) tier = override;
  // An active Build grant applies only to an account that would otherwise be on Paw Go — a paid
  // plan always wins over it (EntitlementService.effectiveTier() on Desktop).
  if (tier === "go" && build?.status === "active") tier = "build";

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
