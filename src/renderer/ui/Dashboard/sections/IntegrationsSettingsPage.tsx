import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { connectionManagerService } from '../../../connectivity/ConnectionManagerService';
import { connectivityCredentialService } from '../../../connectivity/ConnectivityCredentialService';
import { deploymentProfileService } from '../../../connectivity/DeploymentProfileService';
import type {
  ConnectivityScope,
  ConnectorDefinition,
  ConnectorConnection,
  DeploymentProfile,
} from '../../../../shared/connectivity/ConnectivityTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Section 17's persistence is mirrored best-effort: the real IPC action
 *  (connect/disconnect/save/etc.) has already succeeded by the time these
 *  run, so a Supabase write failing here must never surface as if the
 *  action itself failed — only logged, matching CredentialVaultService's
 *  own "best-effort per credential" precedent (applyAllToLocalConnectors). */
async function mirrorBestEffort(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[connectivity] persistence mirror failed (${label}):`, getErrorMessage(e));
  }
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
};

function statusChipStyle(status: ConnectorConnection['status'] | 'notConnected'): React.CSSProperties {
  const colors: Record<string, string> = {
    connected: '#7fd88f',
    disconnected: '#96969e',
    error: '#e08c8c',
    needsReauth: '#e0c88c',
    notConnected: '#6f6f78',
  };
  return {
    display: 'inline-block',
    fontSize: 11.5,
    padding: '2px 8px',
    borderRadius: 999,
    border: `1px solid ${colors[status] ?? '#6f6f78'}`,
    color: colors[status] ?? '#96969e',
  };
}

/**
 * Renders purely from `connectivityRuntime.connectors.list()` and
 * `.connections.listConnections()` via the IPC bridge — no hardcoded
 * connector cards anywhere in this file. Every operation goes through
 * `ipc.connectivity*` (never a direct import of a main-process manager),
 * per Section 16's "renderer never bypasses IPC" requirement.
 *
 * Two honest sections: "Detected on this machine" (Discovery Service's
 * `authMethod: 'none'` entries — real presence checks, no fake data) and
 * "Connect a service" (any other registered connector — empty with a plain
 * "No integrations available yet" message until a real connector is
 * registered in a future phase, since none exist this phase).
 */
export function IntegrationsSettingsPage({ scope }: { scope: ConnectivityScope }) {
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [profiles, setProfiles] = useState<DeploymentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshingDiscovery, setRefreshingDiscovery] = useState(false);

  const [busyConnectorId, setBusyConnectorId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [oauthPending, setOauthPending] = useState<Record<string, string>>({}); // connectorId -> requestId

  async function reload() {
    try {
      const [connectorsResult, connectionsResult, profilesResult] = await Promise.all([
        ipc.connectivityListConnectors(),
        ipc.connectivityListConnections(scope),
        ipc.connectivityDeploymentProfilesList(scope),
      ]);
      if (!connectorsResult.ok) throw new Error(connectorsResult.error);
      if (!connectionsResult.ok) throw new Error(connectionsResult.error);
      if (!profilesResult.ok) throw new Error(profilesResult.error);
      setConnectors(connectorsResult.data);
      setConnections(connectionsResult.data);
      setProfiles(profilesResult.data);
      setPageError(null);
    } catch (e) {
      setPageError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  /** Section 17 hydration: reconstructs main's in-memory runtime state from
   *  what was persisted to Supabase, since ConnectionManager/
   *  CredentialVaultBridge/DeploymentProfileManager start empty on every
   *  relaunch. Credentials hydrate first (a connection can't
   *  re-authenticate without one); each item is best-effort — a connector
   *  that isn't currently registered (framework-only phase, or simply not
   *  installed on this machine) is expected to fail here and is silently
   *  skipped, exactly like CredentialVaultService.applyAllToLocalConnectors. */
  async function hydrate() {
    try {
      const credentialMetas = await connectivityCredentialService.listMetadata(scope);
      for (const meta of credentialMetas) {
        if (meta.authMethod !== 'apiToken') continue; // oauth2/sshKey hydration is future connector-specific work
        try {
          const decrypted = await connectivityCredentialService.read(scope, meta.connectorId);
          if (!decrypted) continue;
          await ipc.connectivityApiTokensSave(meta.connectorId, scope, decrypted.secret);
        } catch {
          // best-effort — connector may not be registered yet this session
        }
      }

      const persistedConnections = await connectionManagerService.list(scope);
      for (const persisted of persistedConnections) {
        try {
          const result = await ipc.connectivityConnect(persisted.connectorId, scope);
          if (result.ok) await connectionManagerService.upsert(scope, result.data);
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
      console.error('[connectivity] hydration failed:', getErrorMessage(e));
    }
  }

  useEffect(() => {
    hydrate().then(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.userId, scope.organizationId]);

  async function refreshDiscovery() {
    setRefreshingDiscovery(true);
    try {
      const result = await ipc.connectivityRefreshDiscovery();
      if (!result.ok) throw new Error(result.error);
      await reload();
    } catch (e) {
      setPageError(getErrorMessage(e));
    } finally {
      setRefreshingDiscovery(false);
    }
  }

  function connectionFor(connectorId: string): ConnectorConnection | undefined {
    return connections.find((c) => c.connectorId === connectorId);
  }

  function setRowError(connectorId: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[connectorId] = message;
      else delete next[connectorId];
      return next;
    });
  }

  async function connectWithApiToken(connectorId: string) {
    const token = (tokenInputs[connectorId] ?? '').trim();
    if (!token) return;
    setBusyConnectorId(connectorId);
    setRowError(connectorId, null);
    try {
      const validation = await ipc.connectivityApiTokensValidate(connectorId, token);
      if (!validation.ok) throw new Error(validation.error);
      if (!validation.data.valid) throw new Error(validation.data.reason ?? 'Token failed validation.');

      const saved = await ipc.connectivityApiTokensSave(connectorId, scope, token);
      if (!saved.ok) throw new Error(saved.error);
      await mirrorBestEffort('apiTokens:store', () => connectivityCredentialService.store(scope, connectorId, 'apiToken', token));

      const connected = await ipc.connectivityConnect(connectorId, scope);
      if (!connected.ok) throw new Error(connected.error);
      await mirrorBestEffort('connections:upsert', () => connectionManagerService.upsert(scope, connected.data));

      setTokenInputs((prev) => ({ ...prev, [connectorId]: '' }));
      await reload();
    } catch (e) {
      setRowError(connectorId, getErrorMessage(e));
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function beginOAuth(connectorId: string) {
    setBusyConnectorId(connectorId);
    setRowError(connectorId, null);
    try {
      const result = await ipc.connectivityOAuthBegin(connectorId, scope);
      if (!result.ok) throw new Error(result.error);
      setOauthPending((prev) => ({ ...prev, [connectorId]: result.data.requestId }));
    } catch (e) {
      setRowError(connectorId, getErrorMessage(e));
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function cancelOAuth(connectorId: string) {
    const requestId = oauthPending[connectorId];
    if (!requestId) return;
    setBusyConnectorId(connectorId);
    try {
      await ipc.connectivityOAuthCancel(requestId);
    } catch (e) {
      setRowError(connectorId, getErrorMessage(e));
    } finally {
      setOauthPending((prev) => {
        const next = { ...prev };
        delete next[connectorId];
        return next;
      });
      setBusyConnectorId(null);
    }
  }

  async function checkHealth(connectorId: string, connectionId: string) {
    setBusyConnectorId(connectorId);
    setRowError(connectorId, null);
    try {
      const result = await ipc.connectivityCheckHealth(connectionId);
      if (!result.ok) throw new Error(result.error);
      await mirrorBestEffort('connections:upsert', () => connectionManagerService.upsert(scope, result.data));
      await reload();
    } catch (e) {
      setRowError(connectorId, getErrorMessage(e));
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function disconnect(connectorId: string, connectionId: string) {
    setBusyConnectorId(connectorId);
    setRowError(connectorId, null);
    try {
      const result = await ipc.connectivityDisconnect(connectionId);
      if (!result.ok) throw new Error(result.error);
      await mirrorBestEffort('connections:remove', () => connectionManagerService.remove(scope, connectorId));
      await mirrorBestEffort('credentials:revoke', () => connectivityCredentialService.revoke(scope, connectorId));
      await reload();
    } catch (e) {
      setRowError(connectorId, getErrorMessage(e));
    } finally {
      setBusyConnectorId(null);
    }
  }

  const detected = connectors.filter((c) => c.authMethod === 'none');
  const connectable = connectors.filter((c) => c.authMethod !== 'none');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className={styles.cardTitle}>Detected on this machine</h3>
          <button type="button" className={styles.primaryButton} disabled={refreshingDiscovery} onClick={refreshDiscovery}>
            {refreshingDiscovery ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
          Local tools PawOS can already see and use — no account or credential needed.
        </p>
        {loading ? (
          <p className={styles.cardBody}>Loading…</p>
        ) : detected.length === 0 ? (
          <p className={styles.cardBody}>Nothing detected yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {detected.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{c.displayName}</div>
                  <div style={{ fontSize: 12, color: '#96969e' }}>{c.category}</div>
                </div>
                <span style={statusChipStyle('connected')}>Detected</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Connect a service</h3>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
          Connect an external service PawOS can act on your behalf against.
        </p>
        {loading ? (
          <p className={styles.cardBody}>Loading…</p>
        ) : connectable.length === 0 ? (
          <p className={styles.cardBody}>No integrations available yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {connectable.map((c) => {
              const connection = connectionFor(c.id);
              const busy = busyConnectorId === c.id;
              const pendingRequestId = oauthPending[c.id];
              return (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5 }}>{c.displayName}</div>
                      <div style={{ fontSize: 12, color: '#96969e' }}>
                        {c.category} · {c.authMethod}
                      </div>
                    </div>
                    <span style={statusChipStyle(connection?.status ?? 'notConnected')}>
                      {connection ? connection.status : 'Not connected'}
                    </span>
                    {connection?.healthStatus && (
                      <span style={statusChipStyle(connection.healthStatus === 'healthy' ? 'connected' : 'error')}>
                        {connection.healthStatus}
                      </span>
                    )}
                  </div>

                  {connection ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" disabled={busy} onClick={() => checkHealth(c.id, connection.id)}>
                        Check health
                      </button>
                      <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => disconnect(c.id, connection.id)}>
                        Disconnect
                      </button>
                    </div>
                  ) : c.authMethod === 'apiToken' ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        type="password"
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder={`${c.displayName} API token`}
                        value={tokenInputs[c.id] ?? ''}
                        onChange={(e) => setTokenInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={busy || !(tokenInputs[c.id] ?? '').trim()}
                        onClick={() => connectWithApiToken(c.id)}
                      >
                        {busy ? 'Connecting…' : 'Connect'}
                      </button>
                    </div>
                  ) : c.authMethod === 'oauth2' ? (
                    pendingRequestId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <span className={styles.cardBody}>Waiting for authorization in your browser…</span>
                        <button type="button" disabled={busy} onClick={() => cancelOAuth(c.id)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => beginOAuth(c.id)}>
                          {busy ? 'Opening browser…' : 'Connect'}
                        </button>
                      </div>
                    )
                  ) : (
                    <p className={styles.cardBody} style={{ marginTop: 8 }}>
                      This connector's authentication method ({c.authMethod}) isn't supported from this page yet.
                    </p>
                  )}

                  {rowErrors[c.id] && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 8 }}>{rowErrors[c.id]}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Deployment profiles</h3>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
          Saved deployment targets — where PawOS deploys to when you ask it to.
        </p>
        {loading ? (
          <p className={styles.cardBody}>Loading…</p>
        ) : profiles.length === 0 ? (
          <p className={styles.cardBody}>No deployment profiles yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profiles.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#96969e' }}>
                    {p.config.kind === 'managedPlatform' ? `Managed platform · ${p.config.connectorId}` : `SSH · ${p.config.host}`}
                  </div>
                </div>
                {p.isDefault && <span style={statusChipStyle('connected')}>Default</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {pageError && <p style={{ color: '#e08c8c', fontSize: 12.5 }}>{pageError}</p>}
    </div>
  );
}
