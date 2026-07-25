import { connectorRegistry } from './ConnectorRegistry';
import { discoveryService } from './DiscoveryService';
import { capabilityResolver } from './CapabilityResolver';
import { connectionManager } from './ConnectionManager';
import { credentialVaultBridge } from './CredentialVaultBridge';
import { oauthManager } from './OAuthManager';
import { apiTokenManager } from './ApiTokenManager';
import { webhookManager } from './WebhookManager';
import { connectivityEventBus } from './EventBus';
import { deploymentProfileManager } from './DeploymentProfileManager';

/**
 * The single, unified entry point for everything in the Connectivity
 * Runtime — orchestration only, zero business logic of its own. Every
 * property below is the exact same singleton instance already constructed
 * and exported by that manager's own module (e.g. `connectivityRuntime.
 * connections` IS `connectionManager`, not a copy of it) — this facade
 * never constructs a second instance of anything, so there is nothing here
 * that could hold duplicate state or drift out of sync with a caller that
 * imported a manager module directly.
 *
 * Its only real job is to be the one place that knows the full shape of
 * the runtime, so future callers (the IPC layer in Section 15, the
 * Connections Settings UI in Section 16) depend on this facade instead of
 * reaching into ten separate manager modules themselves.
 */
export const connectivityRuntime = {
  connectors: connectorRegistry,
  discovery: discoveryService,
  capabilities: capabilityResolver,
  connections: connectionManager,
  credentials: credentialVaultBridge,
  oauth: oauthManager,
  apiTokens: apiTokenManager,
  webhooks: webhookManager,
  events: connectivityEventBus,
  deploymentProfiles: deploymentProfileManager,
};
