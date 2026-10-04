/**
 * pawos-web's view of the PawOS entitlement system — NOT a second one. The rules themselves are
 * defined in the desktop app (src/main/billing/EntitlementService.ts: GO/PRO/PRO_MAX/TEAM/
 * ENTERPRISE/BUILD_FEATURES, and src/shared/connectivity/ConnectivityTypes.ts:
 * CONNECTOR_REQUIRED_FEATURE). pawos-web builds separately and cannot import that code, so the
 * connector slice of those rules is mirrored here and entitlements.test.ts reads the desktop
 * source files and fails if this mirror ever disagrees with them.
 *
 * Only the server uses these functions to decide anything: pages and API routes call them with a
 * tier resolved from the database (see accountContext.ts), never with a tier the browser sent.
 */

export type AccountTier = "go" | "pro" | "proMax" | "team" | "enterprise" | "build";

export type ConnectorFeatureId =
  | "connectGithub"
  | "connectGitlab"
  | "connectBitbucket"
  | "connectLinear"
  | "connectJira"
  | "connectSlack"
  | "connectVercel"
  | "connectNetlify"
  | "connectRailway";

export const TIER_LABELS: Record<AccountTier, string> = {
  go: "Paw Go",
  pro: "Paw Pro",
  proMax: "Paw Pro Max",
  team: "Team",
  enterprise: "Enterprise",
  build: "PawOS Build",
};

/** Mirrors CONNECTOR_REQUIRED_FEATURE for the connectors this release registers. */
export const CONNECTOR_REQUIRED_FEATURE: Record<string, ConnectorFeatureId> = {
  github: "connectGithub",
  gitlab: "connectGitlab",
  bitbucket: "connectBitbucket",
  linear: "connectLinear",
  jira: "connectJira",
  slack: "connectSlack",
  vercel: "connectVercel",
  netlify: "connectNetlify",
  railway: "connectRailway",
};

const GO: ConnectorFeatureId[] = ["connectGithub"];
const PRO: ConnectorFeatureId[] = [...GO, "connectSlack", "connectGitlab", "connectVercel", "connectNetlify", "connectRailway"];
const PRO_MAX: ConnectorFeatureId[] = [...PRO, "connectLinear", "connectJira"];
/** Bitbucket is an organization connector: Team and Enterprise only, as on Desktop (TEAM_FEATURES). */
const TEAM: ConnectorFeatureId[] = [...PRO_MAX, "connectBitbucket"];

/** The connector features each tier holds — the connector slice of the desktop's TIER_ENTITLEMENTS. */
export const TIER_CONNECTOR_FEATURES: Record<AccountTier, readonly ConnectorFeatureId[]> = {
  go: GO,
  pro: PRO,
  proMax: PRO_MAX,
  team: TEAM,
  enterprise: TEAM,
  build: ["connectGithub", "connectVercel"],
};

export function tierHasFeature(tier: AccountTier, feature: string): boolean {
  return (TIER_CONNECTOR_FEATURES[tier] as readonly string[]).includes(feature);
}

/** Purchasable tiers from lowest to highest — Build is admin-granted and never an upgrade target. */
const UPGRADE_ORDER: AccountTier[] = ["go", "pro", "proMax", "team", "enterprise"];

/** The lowest purchasable tier that includes `feature`, for "Available on …" copy. */
export function lowestTierWithFeature(feature: string): AccountTier | null {
  return UPGRADE_ORDER.find((tier) => tierHasFeature(tier, feature)) ?? null;
}
