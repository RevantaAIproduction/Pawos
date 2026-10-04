import type { AccountTier } from "./entitlements";
import { tierHasFeature } from "./entitlements";

/**
 * The Companion catalog: the Companions an account can select as its PawOS desktop companion.
 * This file holds the presentation metadata; the ids and their entitlement requirement are
 * enforced by the backend's companion_catalog table (see
 * supabase/migrations/20261004000000_account_profile_companion.sql) and companionCatalog.test.ts
 * fails if the two ever list different ids.
 *
 * To add a Companion: add a row to companion_catalog in a migration, add an entry here, and give
 * the desktop app a profile with the same id. Nothing else selects by hardcoded id.
 *
 * Only real Companions are listed. Today that is Paw — the one official Companion the desktop app
 * ships (DEFAULT_PAW_ID). Companions a user builds locally from an uploaded model exist only on
 * that machine; the account records their name (customCompanionName) but they are not catalog
 * entries and cannot be selected from the web.
 */

export interface CompanionCatalogEntry {
  companionId: string;
  displayName: string;
  description: string;
  /** How to show it: "paw3d" renders the live 3D Paw preview component. */
  preview: "paw3d";
  /** Animations the Companion's rig actually has on the web preview. */
  animations: readonly string[];
  /** A PawOS FeatureId the account must hold, or null when every tier may select it. */
  requiredFeature: string | null;
}

export const COMPANION_CATALOG: readonly CompanionCatalogEntry[] = [
  {
    companionId: "paw-default",
    displayName: "Paw",
    description: "The official PawOS companion. Lives on your desktop, greets you, and reacts while you work.",
    preview: "paw3d",
    animations: ["Idle", "Salute", "Walking", "Talking"],
    requiredFeature: null,
  },
];

export const DEFAULT_COMPANION_ID = "paw-default";

export function getCompanion(companionId: string | null | undefined): CompanionCatalogEntry | undefined {
  return COMPANION_CATALOG.find((entry) => entry.companionId === companionId);
}

export function isCompanionAvailable(entry: CompanionCatalogEntry, tier: AccountTier): boolean {
  return entry.requiredFeature === null || tierHasFeature(tier, entry.requiredFeature);
}
