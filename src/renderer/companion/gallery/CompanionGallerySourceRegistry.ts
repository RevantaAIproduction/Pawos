import type { CompanionGallerySource } from './CompanionGalleryTypes';

/**
 * Same Map-based registry pattern as AvatarGenerationConnectorRegistry/
 * OfficeConnectorRegistry/InfrastructureConnectorRegistry. Zero sources are
 * registered today — this exists so a future Community Gallery (free) or
 * Marketplace (paid) source can be added later without the Companion Gallery
 * UI ever changing. `listConfigured()` honestly returns an empty array until
 * one is.
 */
class CompanionGallerySourceRegistry {
  private sources = new Map<string, CompanionGallerySource>();

  register(source: CompanionGallerySource): void {
    this.sources.set(source.id, source);
  }

  get(id: string): CompanionGallerySource | undefined {
    return this.sources.get(id);
  }

  list(): CompanionGallerySource[] {
    return [...this.sources.values()];
  }

  listConfigured(): CompanionGallerySource[] {
    return this.list().filter((s) => s.isConfigured());
  }
}

export const companionGallerySourceRegistry = new CompanionGallerySourceRegistry();
