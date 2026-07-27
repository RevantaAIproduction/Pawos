import { useEffect } from 'react';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { connectionManagerService } from './ConnectionManagerService';
import { connectivityCredentialService } from './ConnectivityCredentialService';
import { deploymentProfileService } from './DeploymentProfileService';
import type { ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';
import { connectorLifecycleToConnectionStatus } from '../../shared/connectivity/ConnectivityTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Module-level, not React state — survives ConnectionsPage mounting and unmounting every time the
 *  user opens/leaves Settings → Connections, so the restore work underneath only ever runs once per
 *  signed-in session, not once per tab visit. */
let bootstrappedForKey: string | null = null;

/**
 * The one explicit restoration entry point on the renderer side — activates every persisted
 * connector credential into the main process's in-memory state via `connectivity:restore` (which
 * calls `authenticate()`, never `connect()`/OAuth). Runs exactly once per signed-in session.
 *
 * This is deliberately NOT part of `ConnectionsPage.tsx` — that page is pure status discovery (see
 * its own doc comment) and must never itself trigger authentication. Call this once, high enough in
 * the component tree that it runs regardless of whether the user ever opens Settings (mirroring
 * where `main.ts` already does the equivalent for Guest mode at app startup).
 */
export function useConnectivityBootstrap(scope: ConnectivityScope): void {
  useEffect(() => {
    const key = `${scope.userId}:${scope.organizationId ?? ''}`;
    if (bootstrappedForKey === key) return;
    bootstrappedForKey = key;

    (async () => {
      try {
        const credentialMetas = await connectivityCredentialService.listMetadata(scope);
        for (const meta of credentialMetas) {
          try {
            const decrypted = await connectivityCredentialService.read(scope, meta.connectorId);
            if (!decrypted) continue;
            if (meta.authMethod === 'apiToken') {
              // ApiTokenManager.save() already parses+authenticates before persisting — reusing it
              // here keeps apiToken restoration on the exact same validated path a fresh submit uses.
              await ipc.connectivityApiTokensSave(meta.connectorId, scope, decrypted.secret);
            } else {
              await ipc.connectivityRestore(meta.connectorId, scope, {
                accessToken: decrypted.secret,
                refreshToken: decrypted.refreshToken,
                expiresAt: decrypted.expiresAt,
              });
            }
          } catch {
            // best-effort — connector may not be registered yet this session, or the stored
            // credential is stale and no longer authenticates; either way this is expected.
          }
        }

        const persistedConnections = await connectionManagerService.list(scope);
        for (const persisted of persistedConnections) {
          try {
            const statusResult = await ipc.connectivityGetStatus(persisted.connectorId, scope);
            if (statusResult.ok) {
              await connectionManagerService.upsert(scope, {
                ...persisted,
                status: connectorLifecycleToConnectionStatus(statusResult.data.state),
                grantedPermissions: statusResult.data.capabilities,
              });
            }
          } catch {
            // best-effort — connector may not be registered yet this session
          }
        }

        const persistedProfiles = await deploymentProfileService.list(scope);
        for (const profile of persistedProfiles) {
          try {
            await ipc.connectivityDeploymentProfilesHydrate(profile);
          } catch {
            // best-effort
          }
        }
      } catch (e) {
        console.error('[connectivity] bootstrap restore failed:', getErrorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.userId, scope.organizationId]);
}
