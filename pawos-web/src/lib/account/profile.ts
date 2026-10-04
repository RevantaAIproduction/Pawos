import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountContext } from "./accountContext";
import { createServiceClient } from "../supabase/serviceClient";
import { getCompanion, isCompanionAvailable, type CompanionCatalogEntry } from "./companionCatalog";

/**
 * The account profile: canonical Companion selection plus public-profile settings. One row per
 * account in account_profiles, read and written only through the database functions defined in
 * supabase/migrations/20261004000000_account_profile_companion.sql. PawOS Desktop calls the same
 * functions, which is what keeps Web and Desktop on a single Companion selection.
 */

export const PUBLIC_PROFILE_ORIGIN = "https://pawos.revantaai.com";

export interface ProfileLink {
  label: string;
  url: string;
}

export interface AccountProfile {
  handle: string;
  publicProfileEnabled: boolean;
  displayName: string | null;
  bio: string | null;
  links: ProfileLink[];
  /** A catalog Companion id, or null when the desktop app is using a locally-made Companion. */
  companionId: string | null;
  customCompanionName: string | null;
  companionUpdatedAt: string;
}

/** What the public page may show. Deliberately has no user id and no email address. */
export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  links: ProfileLink[];
  companionId: string | null;
  customCompanionName: string | null;
}

export class ProfileError extends Error {
  constructor(
    readonly code: "invalid_handle" | "handle_taken" | "invalid_profile" | "unknown_companion" | "companion_not_available" | "failed",
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export function publicProfileUrl(handle: string): string {
  return `${PUBLIC_PROFILE_ORIGIN}/u/${handle}`;
}

function toLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { label: string; url: string } =>
      Boolean(item) && typeof item.label === "string" && typeof item.url === "string" && item.url.startsWith("https://")
    )
    .map((item) => ({ label: item.label, url: item.url }));
}

function toAccountProfile(data: unknown): AccountProfile {
  const row = (data ?? {}) as Record<string, unknown>;
  if (typeof row.handle !== "string") throw new ProfileError("failed", "Could not load your profile.", 500);
  return {
    handle: row.handle,
    publicProfileEnabled: row.publicProfileEnabled === true,
    displayName: typeof row.displayName === "string" ? row.displayName : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    links: toLinks(row.links),
    companionId: typeof row.companionId === "string" ? row.companionId : null,
    customCompanionName: typeof row.customCompanionName === "string" ? row.customCompanionName : null,
    companionUpdatedAt: typeof row.companionUpdatedAt === "string" ? row.companionUpdatedAt : new Date(0).toISOString(),
  };
}

function profileErrorFrom(message: string | undefined): ProfileError {
  const text = message ?? "";
  if (text.includes("handle_taken")) return new ProfileError("handle_taken", "That handle is already taken.", 409);
  if (text.includes("invalid_handle")) {
    return new ProfileError("invalid_handle", "Use 3–30 lowercase letters, numbers or hyphens, starting and ending with a letter or number.", 400);
  }
  if (text.includes("invalid_profile")) {
    return new ProfileError("invalid_profile", "Check the profile fields: up to 5 https:// links, a bio of at most 280 characters.", 400);
  }
  if (text.includes("unknown_companion")) return new ProfileError("unknown_companion", "That Companion doesn't exist.", 400);
  if (text.includes("companion_not_available")) return new ProfileError("companion_not_available", "That Companion isn't available on your plan.", 403);
  return new ProfileError("failed", "Something went wrong. Please try again.", 500);
}

export async function getMyProfile(supabase: SupabaseClient): Promise<AccountProfile> {
  const { data, error } = await supabase.rpc("get_my_account_profile");
  if (error) throw profileErrorFrom(error.message);
  return toAccountProfile(data);
}

/**
 * Selects a catalog Companion for the account. The catalog and the entitlement are both checked
 * here on the server before anything is written; a Companion that needs a feature the account
 * doesn't hold is rejected even if the request was crafted by hand.
 */
export async function selectCompanion(account: AccountContext, companionId: unknown): Promise<AccountProfile> {
  const entry: CompanionCatalogEntry | undefined = typeof companionId === "string" ? getCompanion(companionId) : undefined;
  if (!entry) throw new ProfileError("unknown_companion", "That Companion doesn't exist.", 400);
  if (!isCompanionAvailable(entry, account.tier)) {
    throw new ProfileError("companion_not_available", "That Companion isn't available on your plan.", 403);
  }

  if (entry.requiredFeature === null) {
    const { data, error } = await account.supabase.rpc("set_my_companion", { p_companion_id: entry.companionId, p_custom_name: null });
    if (error) throw profileErrorFrom(error.message);
    return toAccountProfile(data);
  }
  // A gated Companion: the entitlement was verified above, and only the backend may write it.
  const { data, error } = await createServiceClient().rpc("set_user_companion_service", {
    p_user_id: account.user.id,
    p_companion_id: entry.companionId,
  });
  if (error) throw profileErrorFrom(error.message);
  return toAccountProfile(data);
}

export interface PublicProfileInput {
  enabled: boolean;
  handle: string;
  displayName: string | null;
  bio: string | null;
  links: ProfileLink[];
}

/** Shape-checks the request body. The database function re-validates every field. */
export function parsePublicProfileInput(body: unknown): PublicProfileInput {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const handle = typeof input.handle === "string" ? input.handle.trim().toLowerCase() : "";
  if (!HANDLE_PATTERN.test(handle)) throw profileErrorFrom("invalid_handle");
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const rawLinks = Array.isArray(input.links) ? input.links : [];
  const links = rawLinks.map((item) => {
    const link = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return { label: typeof link.label === "string" ? link.label.trim() : "", url: typeof link.url === "string" ? link.url.trim() : "" };
  });
  if (links.length > 5 || links.some((link) => !link.label || link.label.length > 40 || !/^https:\/\/[^\s<>"']{1,300}$/.test(link.url))) {
    throw profileErrorFrom("invalid_profile");
  }
  const displayName = text(input.displayName);
  const bio = text(input.bio);
  if ((displayName && displayName.length > 80) || (bio && bio.length > 280)) throw profileErrorFrom("invalid_profile");
  return { enabled: input.enabled === true, handle, displayName, bio, links };
}

export async function updatePublicProfile(supabase: SupabaseClient, input: PublicProfileInput): Promise<AccountProfile> {
  const { data, error } = await supabase.rpc("update_my_public_profile", {
    p_enabled: input.enabled,
    p_handle: input.handle,
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_links: input.links,
  });
  if (error) throw profileErrorFrom(error.message);
  return toAccountProfile(data);
}

/**
 * A public profile by handle, or null when there is none or its owner has it switched off — the
 * two cases are indistinguishable to the caller by design. Copies only the whitelisted fields, so
 * even an unexpected extra field in the database response can never reach the page.
 */
export async function getPublicProfile(supabase: SupabaseClient, handle: string): Promise<PublicProfile | null> {
  const normalized = handle.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(normalized)) return null;
  const { data, error } = await supabase.rpc("get_public_profile", { p_handle: normalized });
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.handle !== "string") return null;
  const avatarUrl = typeof row.avatarUrl === "string" && row.avatarUrl.startsWith("https://") ? row.avatarUrl : null;
  return {
    handle: row.handle,
    displayName: typeof row.displayName === "string" && row.displayName ? row.displayName : row.handle,
    avatarUrl,
    bio: typeof row.bio === "string" ? row.bio : null,
    links: toLinks(row.links),
    companionId: typeof row.companionId === "string" ? row.companionId : null,
    customCompanionName: typeof row.customCompanionName === "string" ? row.customCompanionName : null,
  };
}
