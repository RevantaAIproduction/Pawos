import type { VoiceCloningProvider } from './VoiceCloningTypes';

/**
 * Same Map-based registry pattern as AvatarGenerationConnectorRegistry /
 * OfficeConnectorRegistry / InfrastructureConnectorRegistry. Zero
 * providers are registered — `firstConfigured()` honestly returns
 * undefined until a real voice-cloning vendor is actually wired in.
 */
class VoiceCloningProviderRegistry {
  private providers = new Map<string, VoiceCloningProvider>();

  register(provider: VoiceCloningProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): VoiceCloningProvider | undefined {
    return this.providers.get(id);
  }

  list(): VoiceCloningProvider[] {
    return [...this.providers.values()];
  }

  listConfigured(): VoiceCloningProvider[] {
    return this.list().filter((p) => p.isConfigured());
  }

  firstConfigured(): VoiceCloningProvider | undefined {
    return this.listConfigured()[0];
  }
}

export const voiceCloningProviderRegistry = new VoiceCloningProviderRegistry();
