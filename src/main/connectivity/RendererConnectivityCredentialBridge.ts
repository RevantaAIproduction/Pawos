import { ipcMain, type WebContents } from 'electron';
import type { AuthMethod, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';
import {
  CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL,
  CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX,
  CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL,
  CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX,
  type ConnectivityCredentialPersistResponse,
  type ConnectivityCredentialRevokeResponse,
} from '../../shared/connectivity/ConnectivityCredentialBridgeTypes';

const RESPONSE_TIMEOUT_MS = 30_000;

/**
 * P0-4 security fix — see ConnectivityCredentialBridgeTypes.ts's own doc comment for the full
 * rationale. This is the main-process half of the round trip: asks whichever renderer window
 * initiated the connect (identified by `sender`) to persist the just-obtained OAuth credential into
 * Supabase Vault via `connectivityCredentialService.store()`, and awaits its real result — a failure
 * here is surfaced to the caller, never silently swallowed, so a persistence failure is never
 * reported as a successful connect.
 */
export function persistCredentialViaRenderer(
  sender: WebContents,
  scope: ConnectivityScope,
  connectorId: string,
  authMethod: AuthMethod,
  secret: string,
  opts?: { refreshToken?: string; expiresAt?: number }
): Promise<ConnectivityCredentialPersistResponse> {
  return new Promise((resolve) => {
    const requestId = `connectivity-credential-persist:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const channel = `${CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX}:${requestId}`;
    const timeout = setTimeout(() => {
      ipcMain.removeHandler(channel);
      resolve({ ok: false, message: 'Timed out waiting for the app window to persist this connection.' });
    }, RESPONSE_TIMEOUT_MS);

    ipcMain.handle(channel, (event, response: ConnectivityCredentialPersistResponse) => {
      if (event.sender.id !== sender.id) return;
      clearTimeout(timeout);
      ipcMain.removeHandler(channel);
      resolve(response);
    });

    sender.send(CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL, {
      requestId,
      scope,
      connectorId,
      authMethod,
      secret,
      refreshToken: opts?.refreshToken,
      expiresAt: opts?.expiresAt,
    });
  });
}

export function revokeCredentialViaRenderer(sender: WebContents, scope: ConnectivityScope, connectorId: string): Promise<ConnectivityCredentialRevokeResponse> {
  return new Promise((resolve) => {
    const requestId = `connectivity-credential-revoke:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const channel = `${CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX}:${requestId}`;
    const timeout = setTimeout(() => {
      ipcMain.removeHandler(channel);
      resolve({ ok: false, message: 'Timed out waiting for the app window to revoke this connection.' });
    }, RESPONSE_TIMEOUT_MS);

    ipcMain.handle(channel, (event, response: ConnectivityCredentialRevokeResponse) => {
      if (event.sender.id !== sender.id) return;
      clearTimeout(timeout);
      ipcMain.removeHandler(channel);
      resolve(response);
    });

    sender.send(CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL, { requestId, scope, connectorId });
  });
}
