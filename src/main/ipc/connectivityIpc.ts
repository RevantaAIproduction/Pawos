import { ipcMain } from 'electron';
import { connectivityRuntime } from '../connectivity/ConnectivityRuntime';
import type {
  ConnectivityScope,
  ConnectorDefinition,
  ConnectorConnection,
  DeploymentProfile,
  DeploymentProfileConfig,
  ConnectivityIpcResult,
  ApiTokenValidationResult,
  OAuthBeginResult,
} from '../../shared/connectivity/ConnectivityTypes';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isConnectivityScope(value: unknown): value is ConnectivityScope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.userId)) return false;
  if (candidate.organizationId !== undefined && typeof candidate.organizationId !== 'string') return false;
  return true;
}

/**
 * Every `connectivity:*` channel is registered through this one wrapper —
 * it is the only place request-shape validation and response-envelope
 * shaping happen for this namespace, so no individual handler below needs
 * its own try/catch or its own success/error shape. The wrapper carries no
 * business logic of its own: it validates argument *shape* (right type,
 * non-empty), then calls straight into `connectivityRuntime`, then reports
 * whatever came back or was thrown. Every real decision (is this connector
 * registered, does this profile already exist, is this token valid) is
 * still made entirely inside the manager the handler delegates to.
 */
function safeHandle<T>(channel: string, handler: (...args: unknown[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_evt, ...args): Promise<ConnectivityIpcResult<T>> => {
    try {
      const data = await handler(...args);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
}

/**
 * Registers every Connectivity Runtime IPC channel. Deliberately generic
 * and connector-agnostic — every handler below takes a connector id as a
 * plain string and forwards to `connectivityRuntime`; none of them branch
 * on which connector it is. Namespaced under `connectivity:` (and
 * `connectivity:deploymentProfiles:*` as a sub-namespace), following the
 * existing per-feature-prefix convention used by every other IPC surface
 * in this file (`pairing:`, `billing:`, `communication:`, etc.).
 */
export function registerConnectivityIpc(): void {
  safeHandle<ConnectorDefinition[]>('connectivity:listConnectors', () => {
    return connectivityRuntime.connectors.list().map((sdk) => sdk.definition);
  });

  safeHandle<ConnectorConnection[]>('connectivity:listConnections', (scope: unknown) => {
    if (!isConnectivityScope(scope)) {
      throw new Error("connectivity:listConnections requires a valid scope ({ userId, organizationId? }).");
    }
    return connectivityRuntime.connections.listConnections(scope);
  });

  safeHandle<ConnectorConnection>('connectivity:connect', (connectorId: unknown, scope: unknown) => {
    if (!isNonEmptyString(connectorId)) {
      throw new Error('connectivity:connect requires a non-empty connectorId string.');
    }
    if (!isConnectivityScope(scope)) {
      throw new Error("connectivity:connect requires a valid scope ({ userId, organizationId? }).");
    }
    return connectivityRuntime.connections.connect(connectorId, scope);
  });

  safeHandle<void>('connectivity:disconnect', (connectionId: unknown) => {
    if (!isNonEmptyString(connectionId)) {
      throw new Error('connectivity:disconnect requires a non-empty connectionId string.');
    }
    return connectivityRuntime.connections.disconnect(connectionId);
  });

  safeHandle<ConnectorConnection>('connectivity:checkHealth', (connectionId: unknown) => {
    if (!isNonEmptyString(connectionId)) {
      throw new Error('connectivity:checkHealth requires a non-empty connectionId string.');
    }
    return connectivityRuntime.connections.checkHealth(connectionId);
  });

  safeHandle<void>('connectivity:refreshDiscovery', () => {
    return connectivityRuntime.discovery.discoverAndRegister();
  });

  safeHandle<DeploymentProfile>('connectivity:deploymentProfiles:create', (scope: unknown, name: unknown, config: unknown) => {
    if (!isConnectivityScope(scope)) {
      throw new Error("connectivity:deploymentProfiles:create requires a valid scope ({ userId, organizationId? }).");
    }
    if (!isNonEmptyString(name)) {
      throw new Error('connectivity:deploymentProfiles:create requires a non-empty name string.');
    }
    if (!config || typeof config !== 'object' || !('kind' in config)) {
      throw new Error("connectivity:deploymentProfiles:create requires a config object with a 'kind' field.");
    }
    return connectivityRuntime.deploymentProfiles.createProfile(scope, name, config as DeploymentProfileConfig);
  });

  safeHandle<DeploymentProfile | undefined>('connectivity:deploymentProfiles:get', (profileId: unknown) => {
    if (!isNonEmptyString(profileId)) {
      throw new Error('connectivity:deploymentProfiles:get requires a non-empty profileId string.');
    }
    return connectivityRuntime.deploymentProfiles.getProfile(profileId);
  });

  safeHandle<DeploymentProfile[]>('connectivity:deploymentProfiles:list', (scope: unknown) => {
    if (!isConnectivityScope(scope)) {
      throw new Error("connectivity:deploymentProfiles:list requires a valid scope ({ userId, organizationId? }).");
    }
    return connectivityRuntime.deploymentProfiles.listProfiles(scope);
  });

  safeHandle<DeploymentProfile>('connectivity:deploymentProfiles:update', (profileId: unknown, patch: unknown) => {
    if (!isNonEmptyString(profileId)) {
      throw new Error('connectivity:deploymentProfiles:update requires a non-empty profileId string.');
    }
    if (!patch || typeof patch !== 'object') {
      throw new Error('connectivity:deploymentProfiles:update requires a patch object.');
    }
    return connectivityRuntime.deploymentProfiles.updateProfile(profileId, patch as Partial<Pick<DeploymentProfile, 'name' | 'config' | 'isDefault'>>);
  });

  safeHandle<void>('connectivity:deploymentProfiles:remove', (profileId: unknown) => {
    if (!isNonEmptyString(profileId)) {
      throw new Error('connectivity:deploymentProfiles:remove requires a non-empty profileId string.');
    }
    return connectivityRuntime.deploymentProfiles.deleteProfile(profileId);
  });

  // Added for the Connections Settings UI (Section 16) — the minimum the
  // page needs to let a user actually connect an apiToken or oauth2
  // connector, not a full re-exposure of every CredentialVaultBridge/
  // OAuthManager method (raw credential read/rotate/revoke stay
  // main-process-only; the UI never needs a decrypted secret back).
  safeHandle<ApiTokenValidationResult>('connectivity:apiTokens:validate', (connectorId: unknown, token: unknown) => {
    if (!isNonEmptyString(connectorId)) {
      throw new Error('connectivity:apiTokens:validate requires a non-empty connectorId string.');
    }
    if (!isNonEmptyString(token)) {
      throw new Error('connectivity:apiTokens:validate requires a non-empty token string.');
    }
    return connectivityRuntime.apiTokens.validate(connectorId, token);
  });

  safeHandle<void>('connectivity:apiTokens:save', (connectorId: unknown, scope: unknown, token: unknown) => {
    if (!isNonEmptyString(connectorId)) {
      throw new Error('connectivity:apiTokens:save requires a non-empty connectorId string.');
    }
    if (!isConnectivityScope(scope)) {
      throw new Error("connectivity:apiTokens:save requires a valid scope ({ userId, organizationId? }).");
    }
    if (!isNonEmptyString(token)) {
      throw new Error('connectivity:apiTokens:save requires a non-empty token string.');
    }
    return connectivityRuntime.apiTokens.save(connectorId, scope, token);
  });

  safeHandle<OAuthBeginResult>('connectivity:oauth:begin', (connectorId: unknown, scope: unknown) => {
    if (!isNonEmptyString(connectorId)) {
      throw new Error('connectivity:oauth:begin requires a non-empty connectorId string.');
    }
    if (!isConnectivityScope(scope)) {
      throw new Error("connectivity:oauth:begin requires a valid scope ({ userId, organizationId? }).");
    }
    const handle = connectivityRuntime.oauth.beginAuthorization(connectorId, scope);
    // Deliberately NOT returned: `handle.result` — a Promise can't cross
    // IPC, and completing the flow requires a real connector's callback
    // wiring that doesn't exist yet this phase (see Section 9's report).
    // The renderer gets the requestId (to cancel) and the URL (already
    // opened in the system browser by beginAuthorization itself).
    return { requestId: handle.requestId, authorizationUrl: handle.authorizationUrl };
  });

  safeHandle<void>('connectivity:oauth:cancel', (requestId: unknown) => {
    if (!isNonEmptyString(requestId)) {
      throw new Error('connectivity:oauth:cancel requires a non-empty requestId string.');
    }
    connectivityRuntime.oauth.cancelAuthorization(requestId);
  });

  // Section 17 addition: lets the renderer seed a deployment profile
  // reconstructed from Supabase (DeploymentProfileService.list()) back
  // into the live runtime, preserving its persisted id — see
  // DeploymentProfileManager.hydrateProfile()'s own doc comment for why
  // createProfile() can't be reused for this.
  safeHandle<void>('connectivity:deploymentProfiles:hydrate', (profile: unknown) => {
    if (!profile || typeof profile !== 'object') {
      throw new Error('connectivity:deploymentProfiles:hydrate requires a DeploymentProfile object.');
    }
    const candidate = profile as Record<string, unknown>;
    if (!isNonEmptyString(candidate.id)) {
      throw new Error('connectivity:deploymentProfiles:hydrate requires a non-empty id.');
    }
    if (!isConnectivityScope(candidate.scope)) {
      throw new Error("connectivity:deploymentProfiles:hydrate requires a valid scope ({ userId, organizationId? }).");
    }
    if (!isNonEmptyString(candidate.name)) {
      throw new Error('connectivity:deploymentProfiles:hydrate requires a non-empty name.');
    }
    if (!candidate.config || typeof candidate.config !== 'object' || !('kind' in candidate.config)) {
      throw new Error("connectivity:deploymentProfiles:hydrate requires a config object with a 'kind' field.");
    }
    return connectivityRuntime.deploymentProfiles.hydrateProfile(profile as DeploymentProfile);
  });
}
