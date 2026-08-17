import { getIpcBridge } from '../services/ipc/ipcBridge';
import { connectivityCredentialService } from './ConnectivityCredentialService';

/**
 * P0-4 security fix. Installs the renderer half of the main<->renderer credential-persistence
 * round trip (see ConnectivityCredentialBridgeTypes.ts / RendererConnectivityCredentialBridge.ts):
 * the main process cannot reach Supabase itself, so it asks this listener to durably store/revoke a
 * connector credential via the renderer's already-authenticated `connectivityCredentialService`
 * (Supabase Vault-backed). Installed once at renderer bootstrap, mirroring
 * `installOrganizationUsageBridge()`'s exact pattern.
 */
export function installConnectivityCredentialBridge(): void {
  const ipc = getIpcBridge();

  ipc.onConnectivityCredentialPersistRequest(async (request) => {
    try {
      await connectivityCredentialService.store(request.scope, request.connectorId, request.authMethod, request.secret, {
        refreshToken: request.refreshToken,
        expiresAt: request.expiresAt,
      });
      await ipc.connectivityCredentialPersistRespond(request.requestId, { ok: true });
    } catch (err) {
      await ipc.connectivityCredentialPersistRespond(request.requestId, {
        ok: false,
        message: err instanceof Error ? err.message : 'Could not persist this connection.',
      });
    }
  });

  ipc.onConnectivityCredentialRevokeRequest(async (request) => {
    try {
      await connectivityCredentialService.revoke(request.scope, request.connectorId);
      await ipc.connectivityCredentialRevokeRespond(request.requestId, { ok: true });
    } catch (err) {
      await ipc.connectivityCredentialRevokeRespond(request.requestId, {
        ok: false,
        message: err instanceof Error ? err.message : 'Could not revoke this connection.',
      });
    }
  });
}
