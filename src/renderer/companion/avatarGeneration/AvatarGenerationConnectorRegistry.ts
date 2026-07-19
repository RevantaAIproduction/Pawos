import type { AvatarGenerationConnector } from './AvatarGenerationTypes';

/**
 * Same Map-based registry pattern as OfficeConnectorRegistry/
 * InfrastructureConnectorRegistry. A permanently out-of-scope extension
 * point (see AvatarGenerationTypes.ts) — zero connectors are registered and
 * none are planned; `firstConfigured()` honestly returns undefined.
 */
class AvatarGenerationConnectorRegistry {
  private connectors = new Map<string, AvatarGenerationConnector>();

  register(connector: AvatarGenerationConnector): void {
    this.connectors.set(connector.id, connector);
  }

  get(id: string): AvatarGenerationConnector | undefined {
    return this.connectors.get(id);
  }

  list(): AvatarGenerationConnector[] {
    return [...this.connectors.values()];
  }

  listConfigured(): AvatarGenerationConnector[] {
    return this.list().filter((c) => c.isConfigured());
  }

  firstConfigured(): AvatarGenerationConnector | undefined {
    return this.listConfigured()[0];
  }
}

export const avatarGenerationConnectorRegistry = new AvatarGenerationConnectorRegistry();
