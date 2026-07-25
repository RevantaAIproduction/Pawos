import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';
import type { ConnectorCategory } from '../../shared/connectivity/ConnectivityTypes';

/**
 * The Connectivity Runtime's extension point. Every connector — GitHub,
 * GitLab, Jira, Linear, Vercel, Railway, Netlify, a generic SSH server, a
 * locally-detected CLI tool, or anything built after this file was written —
 * becomes usable by the rest of the runtime purely by calling `register()`
 * with a `ConnectorSDK` implementation. No other file in this runtime is
 * ever meant to import a specific connector directly; every manager
 * (ConnectionManager, CapabilityResolver, OAuthManager, ApiTokenManager,
 * WebhookManager) looks a connector up here and talks to it only through
 * the `ConnectorSDK` interface.
 *
 * Holds live SDK instances, not bare metadata — this is what makes "the
 * Runtime only talks through the SDK" concrete rather than aspirational.
 *
 * Starts empty of any real (Jira/GitHub/Slack-style) connector. The only
 * entries expected during this framework phase are the Discovery Service's
 * local-tool detections (Git, Docker, kubectl, etc.) — see DiscoveryService.ts.
 */
class ConnectorRegistry {
  private connectors = new Map<string, ConnectorSDK>();

  /** Throws if a connector with this id is already registered — a silent
   *  overwrite here would make two different adapters fight over the same
   *  id invisible until something broke at runtime. */
  register(sdk: ConnectorSDK): void {
    const id = sdk.definition.id;
    if (this.connectors.has(id)) {
      throw new Error(`Connector already registered: '${id}'. Each connector id must be unique across the registry.`);
    }
    this.connectors.set(id, sdk);
  }

  /** Removes a connector's registration entirely (distinct from disconnecting
   *  a user's connection to it) — used when the Discovery Service re-scans
   *  and a previously-detected local tool is no longer present. */
  unregister(id: string): void {
    this.connectors.delete(id);
  }

  get(id: string): ConnectorSDK | undefined {
    return this.connectors.get(id);
  }

  list(): ConnectorSDK[] {
    return [...this.connectors.values()];
  }

  listByCategory(category: ConnectorCategory): ConnectorSDK[] {
    return this.list().filter((sdk) => sdk.definition.category === category);
  }
}

export const connectorRegistry = new ConnectorRegistry();
