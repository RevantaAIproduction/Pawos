/**
 * A pre-made companion entry offered by an external source — a future
 * Community Gallery or Marketplace. No real source exists yet (see
 * CompanionGallerySourceRegistry.ts); this only describes the shape one would
 * return so the Companion Gallery UI can render real entries the moment a
 * source is registered, without a UI change.
 */
export type CompanionGalleryEntry = {
  id: string;
  name: string;
  thumbnailUrl: string;
  authorName?: string;
  /** Present only for a paid marketplace source; absent for a free community source. */
  priceCents?: number;
};

/**
 * A modular source of pre-made companions — a future Community Gallery
 * (free, user-submitted) or Marketplace (paid) integration. Kept
 * provider-agnostic on purpose, same discipline as
 * AvatarGenerationConnector: the Companion Gallery UI calls only this
 * interface and never a specific backend.
 */
export interface CompanionGallerySource {
  id: string;
  displayName: string;
  /** True once this source has real credentials/endpoint configured. Always false today — no source is registered. */
  isConfigured(): boolean;
  listEntries(): Promise<CompanionGalleryEntry[]>;
}
