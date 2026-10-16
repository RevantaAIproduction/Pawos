import { accountSession } from '../auth/AccountSession';
import { baseConnectorId, isMcpCredentialId } from '../../shared/connectivity/McpProviders';
import { connectorRegistry } from './ConnectorRegistry';
import { isStaleAccountOperation } from './accountEpoch';
import { connectionManager } from './ConnectionManager';
import { credentialVaultBridge } from './CredentialVaultBridge';
import { deploymentProfileManager } from './DeploymentProfileManager';
import { jiraMetadataStore } from './JiraMetadataStore';
import { connectorMcpGateway } from './mcp/ConnectorMcpGateway';

/**
 * Connector credentials never cross accounts. Everything the main process holds for a connection —
 * the credential cache, each connector's own token, the live connections, MCP sessions and Jira
 * metadata — belongs to the account signed in when it was obtained, and is forgotten the moment that
 * account changes (sign-out, or a different account signs in). Stored copies are not touched: the
 * next account restores its own.
 *
 * A connect or refresh still running for the previous account is refused by the vault when it
 * tries to store its token; the connector that obtained it is then told to forget it too.
 */
export function forgetConnectivityState(): void {
  for (const sdk of connectorRegistry.list()) sdk.forgetLocalSession?.();
  connectionManager.forgetAll();
  connectorMcpGateway.resetAll();
  jiraMetadataStore.clearAll();
  deploymentProfileManager.forgetAll();
  credentialVaultBridge.clear();
}

let installed = false;

/** Wires the boundary once (idempotent): account changes and refused vault writes. */
export function installConnectivityAccountBoundary(): void {
  if (installed) return;
  installed = true;
  accountSession.on('changed', () => forgetConnectivityState());
  credentialVaultBridge.onRefusedWrite((credentialId) => {
    // A stale operation (started for an account that is no longer signed in): the connector's
    // account-bound state already refused it (accountEpoch.ts), and the integration may now hold the
    // new account's session — which must not be forgotten or have its live connector replaced.
    if (isStaleAccountOperation()) return;
    const connectorId = baseConnectorId(credentialId);
    connectorMcpGateway.reset(connectorId);
    // A connector's separate MCP sign-in lives only in the vault — the connector itself holds no MCP
    // token, so its own session (possibly the new account's) is left alone. Only the integration that
    // set the refused token in memory forgets it; others are keyed separately and never touched.
    if (!isMcpCredentialId(credentialId)) connectorRegistry.get(connectorId)?.forgetLocalSession?.();
  });
}
