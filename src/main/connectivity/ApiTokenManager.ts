import { connectorRegistry } from './ConnectorRegistry';
import { credentialVaultBridge } from './CredentialVaultBridge';
import type { ConnectivityScope, ApiTokenValidationResult } from '../../shared/connectivity/ConnectivityTypes';

/**
 * The API-token counterpart to OAuthManager — for connectors whose
 * `authMethod` is `'apiToken'` (a personal access token / API key pasted by
 * the user, rather than a browser consent flow). Deliberately provider-
 * agnostic: the only "HTTP logic" here is one generic authenticated GET
 * against whatever URL the connector itself declares in
 * `ConnectorDefinition.healthCheck` — there is no per-connector branch, no
 * knowledge of GitHub/Jira/Linear specifically, anywhere in this file. A
 * connector that wants real validation must declare a real `healthCheck`;
 * one that doesn't gets an honest "cannot validate" result rather than a
 * guessed-at request shape.
 *
 * Storage is entirely delegated to `CredentialVaultBridge` — this class
 * holds no state of its own and duplicates none of that store/read/rotate/
 * revoke logic (e.g. `rotate()`'s "no existing credential" error already
 * comes from the vault, not reimplemented here).
 */

function requireApiTokenConnector(connectorId: string): ReturnType<typeof connectorRegistry.get> {
  const sdk = connectorRegistry.get(connectorId);
  if (!sdk) {
    throw new Error(`No connector registered with id '${connectorId}'.`);
  }
  if (sdk.definition.authMethod !== 'apiToken') {
    throw new Error(`Connector '${connectorId}' does not use API token authentication (authMethod: '${sdk.definition.authMethod}').`);
  }
  return sdk;
}

class ApiTokenManager {
  /** Validates a *candidate* token before it's ever saved anywhere — never
   *  throws, since "is this token valid" is an expected, fallible question,
   *  not an error condition. Delegates entirely to the connector's own
   *  declared `healthCheck` (a plain authenticated GET); a connector with
   *  no `healthCheck` declared, or the wrong `authMethod`, or that isn't
   *  registered at all, all resolve to a clean `{ valid: false, reason }`
   *  rather than a thrown exception or a guessed provider-specific call. */
  async validate(connectorId: string, token: string): Promise<ApiTokenValidationResult> {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      return { valid: false, reason: `No connector registered with id '${connectorId}'.` };
    }
    if (sdk.definition.authMethod !== 'apiToken') {
      return { valid: false, reason: `Connector '${connectorId}' does not use API token authentication (authMethod: '${sdk.definition.authMethod}').` };
    }
    const healthCheck = sdk.definition.healthCheck;
    if (!healthCheck) {
      return { valid: false, reason: `Connector '${connectorId}' does not declare a health check endpoint, so its token cannot be validated.` };
    }

    try {
      const response = await fetch(healthCheck.path, {
        method: healthCheck.method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) return { valid: true };
      return { valid: false, reason: `Health check returned HTTP ${response.status}.` };
    } catch (error) {
      return { valid: false, reason: `Health check request failed: ${(error as Error).message}` };
    }
  }

  /** Saving is a real configuration error if the connector isn't registered
   *  or doesn't use API-token auth — unlike validate(), which is answering
   *  a question, this is performing an action, so it throws. */
  async save(connectorId: string, scope: ConnectivityScope, token: string): Promise<void> {
    requireApiTokenConnector(connectorId);
    await credentialVaultBridge.store(connectorId, scope, token, 'apiToken');
  }

  /** Pure passthrough — CredentialVaultBridge already owns "no existing
   *  credential to rotate" as an error condition; this doesn't duplicate
   *  that check. */
  async rotate(connectorId: string, scope: ConnectivityScope, newToken: string): Promise<void> {
    await credentialVaultBridge.rotate(connectorId, scope, newToken);
  }

  async revoke(connectorId: string, scope: ConnectivityScope): Promise<void> {
    await credentialVaultBridge.revoke(connectorId, scope);
  }
}

export const apiTokenManager = new ApiTokenManager();
