import React, { useEffect, useMemo, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { connectionManagerService } from '../../../connectivity/ConnectionManagerService';
import { connectivityCredentialService } from '../../../connectivity/ConnectivityCredentialService';
import { ConnectorLogo, DetectedToolIcon } from '../ConnectorIcons';
import { LiveStatusPill, type LiveState } from '../LiveStatusPill';
import { SlideOver } from '../SlideOver';
import { SettingsPageHeader } from '../SettingsPageHeader';
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

async function mirrorBestEffort(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[connectivity] persistence mirror failed (${label}):`, getErrorMessage(e));
  }
}

const fieldInputStyle: React.CSSProperties = {
  background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
  borderRadius: 8,
  color: 'var(--pawos-fg)',
  padding: '8px 10px',
  fontSize: 13,
  width: '100%',
};

function connectionLiveState(status: ConnectorConnection['status'] | 'notConnected'): LiveState {
  if (status === 'connected') return 'live';
  if (status === 'needsReauth' || status === 'error') return 'error';
  return 'off';
}

/** Read-only infra connectors (GitHub, GitLab, Linear, Vercel, Netlify, Railway) are configured
 *  entirely via env vars today — this is just the honest "where would I set that" hint shown in
 *  their slide-over, not a claim that this page can write it for you. */
const CLOUD_ENV_HINT: Record<string, string> = {
  github: 'GITHUB_TOKEN',
  gitlab: 'GITLAB_TOKEN',
  linear: 'LINEAR_API_KEY',
  vercel: 'VERCEL_TOKEN',
  netlify: 'NETLIFY_TOKEN',
  railway: 'RAILWAY_TOKEN',
};

interface InfraStatus {
  kind: string;
  id: string;
  displayName: string;
  configured: boolean;
  detail?: string;
}

type SelectedCard =
  | { kind: 'connectivity'; id: string }
  | { kind: 'infra'; id: string; displayName: string; configured: boolean; detail?: string }
  | { kind: 'runtime'; id: string; displayName: string; description: string }
  | { kind: 'comingSoon'; id: string; displayName: string };

function ConnectionCard({
  logo,
  title,
  description,
  state,
  stateLabel,
  detail,
  disabled,
  onClick,
}: {
  logo: React.ReactNode;
  title: string;
  description: string;
  state: LiveState;
  stateLabel: string;
  detail?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.connectionCard} data-disabled={disabled} onClick={onClick}>
      <div className={styles.connectionCardTop}>
        <div className={styles.connectionCardTitleRow}>
          {logo}
          <span className={styles.connectionCardTitle}>{title}</span>
        </div>
      </div>
      <LiveStatusPill state={state} label={stateLabel} />
      <div className={styles.connectionCardStats}>
        <div className={styles.connectionCardStatRow}>{description}</div>
        {detail && <div className={styles.connectionCardStatRow}><strong>{detail}</strong></div>}
      </div>
    </button>
  );
}

/**
 * Connections — every service, server, and local tool PawOS can act through, grouped by what it
 * is (Cloud Services / Infrastructure / Runtime) instead of one flat list. Real data only:
 * Jira/Google Workspace come from the Connectivity Runtime (registered `ConnectorSDK`s, discovered
 * generically via `connectivityListConnectors()` — a new connector needs zero edits here);
 * GitHub/GitLab/Linear/Vercel/Netlify/Railway/Docker/Kubernetes come from the existing
 * `listConfiguredInfraConnectors` action (env-var configured, read-only from here, not yet unified
 * onto the ConnectorSDK registry); Browser/Filesystem/Terminal are PawOS's own always-on
 * capabilities; VS Code/Cursor come from the Discovery Service's real presence detection.
 * Cloudflare/Supabase/SSH Servers/Virtual Machines are honestly marked "Coming soon" — no connector
 * exists for them yet, matching this app's no-fake-data convention.
 *
 * Contract: this page is a read-only view over connector state. It must never itself initiate
 * authentication, OAuth, restoration, synchronization, webhook registration, or token refresh — its
 * only responsibility is `connectivityListConnectors()` -> `connectivityGetStatus()` per connector
 * -> render. Credential restoration happens once per session elsewhere (see
 * `useConnectivityBootstrap`, called from `SettingsSection.tsx`); the only mutating calls left in
 * this file are the explicit, user-click-triggered `connectWithApiToken`/`connectOAuth`/`disconnect`/
 * `checkHealth` handlers below, each wired to a button, never to a mount effect.
 */
export function ConnectionsPage({ scope }: { scope: ConnectivityScope }) {
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [profiles, setProfiles] = useState<DeploymentProfile[]>([]);
  const [infra, setInfra] = useState<{ connectors: InfraStatus[]; cliTools: InfraStatus[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshingDiscovery, setRefreshingDiscovery] = useState(false);
  const [selected, setSelected] = useState<SelectedCard | null>(null);

  const [busyConnectorId, setBusyConnectorId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [extraFieldInputs, setExtraFieldInputs] = useState<Record<string, Record<string, string>>>({});

  async function reload() {
    try {
      const [connectorsResult, connectionsResult, profilesResult, infraResult] = await Promise.all([
        ipc.connectivityListConnectors(),
        ipc.connectivityListConnections(scope),
        ipc.connectivityDeploymentProfilesList(scope),
        ipc.actionExecute({ type: 'listConfiguredInfraConnectors' }),
      ]);
      if (!connectorsResult.ok) throw new Error(connectorsResult.error);
      if (!connectionsResult.ok) throw new Error(connectionsResult.error);
      if (!profilesResult.ok) throw new Error(profilesResult.error);
      setConnectors(connectorsResult.data);
      setConnections(connectionsResult.data);
      setProfiles(profilesResult.data);
      if (infraResult.ok) setInfra(infraResult.data as { connectors: InfraStatus[]; cliTools: InfraStatus[] });
      setPageError(null);
    } catch (e) {
      setPageError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // Pure status discovery on mount — this page must never itself trigger authentication,
  // restoration, sync, or webhook registration (see the component doc comment below). Credential
  // restoration happens once per session via useConnectivityBootstrap, called from SettingsSection
  // (mounted whenever any Settings tab is open, not gated behind this page specifically) — by the
  // time this page can be reached, that restore has either already run or is already in flight.
  useEffect(() => {
    reload();
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

  async function connectWithApiToken(c: ConnectorDefinition) {
    const primary = (tokenInputs[c.id] ?? '').trim();
    if (!primary) return;
    const additionalFields = c.apiTokenHelp?.additionalFields ?? [];
    const missing = additionalFields.find((f) => !(extraFieldInputs[c.id]?.[f.name] ?? '').trim());
    if (missing) {
      setRowError(c.id, `${missing.label} is required.`);
      return;
    }

    setBusyConnectorId(c.id);
    setRowError(c.id, null);
    try {
      const payload = additionalFields.length
        ? JSON.stringify({
            ...Object.fromEntries(additionalFields.map((f) => [f.name, (extraFieldInputs[c.id]?.[f.name] ?? '').trim()])),
            apiToken: primary,
          })
        : primary;

      if (!additionalFields.length) {
        const validation = await ipc.connectivityApiTokensValidate(c.id, primary);
        if (!validation.ok) throw new Error(validation.error);
        if (!validation.data.valid) throw new Error(validation.data.reason ?? 'Token failed validation.');
      }

      const saved = await ipc.connectivityApiTokensSave(c.id, scope, payload);
      if (!saved.ok) throw new Error(saved.error);
      await mirrorBestEffort('apiTokens:store', () => connectivityCredentialService.store(scope, c.id, 'apiToken', payload));

      const connected = await ipc.connectivityConnect(c.id, scope);
      if (!connected.ok) throw new Error(connected.error);
      await mirrorBestEffort('connections:upsert', () => connectionManagerService.upsert(scope, connected.data));

      setTokenInputs((prev) => ({ ...prev, [c.id]: '' }));
      setExtraFieldInputs((prev) => ({ ...prev, [c.id]: {} }));
      await reload();
    } catch (e) {
      setRowError(c.id, getErrorMessage(e));
    } finally {
      setBusyConnectorId(null);
    }
  }

  async function connectOAuth(connectorId: string) {
    setBusyConnectorId(connectorId);
    setRowError(connectorId, null);
    try {
      const result = await ipc.connectivityConnect(connectorId, scope);
      if (!result.ok) throw new Error(result.error);
      await mirrorBestEffort('connections:upsert', () => connectionManagerService.upsert(scope, result.data));
      await reload();
    } catch (e) {
      setRowError(connectorId, getErrorMessage(e));
    } finally {
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

  const connectable = connectors.filter((c) => c.authMethod !== 'none');
  const detectedTools = connectors.filter((c) => c.authMethod === 'none');
  const vscodeLike = detectedTools.filter((c) => ['vscode', 'cursor', 'windsurf'].includes(c.id));

  const infraCloud = useMemo(
    () => (infra?.connectors ?? []).filter((c) => CLOUD_ENV_HINT[c.id]),
    [infra]
  );
  const infraContainers = useMemo(() => infra?.cliTools.filter((c) => c.kind === 'container') ?? [], [infra]);

  const connectedCloudCount =
    connectable.filter((c) => connectionFor(c.id)?.status === 'connected').length +
    infraCloud.filter((c) => c.configured).length;
  const totalCloudCount = connectable.length + infraCloud.length;

  return (
    <div>
      <SettingsPageHeader
        title="Connections"
        description="Every service, server, and local tool PawOS can act through — grouped by what it is."
        status={
          <LiveStatusPill
            state={connectedCloudCount > 0 ? 'live' : 'idle'}
            label={<><strong>{connectedCloudCount}</strong> of {totalCloudCount} connected</>}
          />
        }
        action={
          <button type="button" className={styles.chip} disabled={refreshingDiscovery} onClick={refreshDiscovery}>
            {refreshingDiscovery ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {loading ? (
        <p className={styles.cardBody}>Loading…</p>
      ) : (
        <>
          <div className={styles.categorySection}>
            <h3 className={styles.categorySectionTitle}>Cloud Services</h3>
            <p className={styles.categorySectionDesc}>Tickets, repositories, and deployments PawOS can read and act on.</p>
            <div className={styles.connectionCardGrid}>
              {connectable.map((c) => {
                const connection = connectionFor(c.id);
                const state = connectionLiveState(connection?.status ?? 'notConnected');
                return (
                  <ConnectionCard
                    key={c.id}
                    logo={<ConnectorLogo connectorId={c.id} displayName={c.displayName} size={28} />}
                    title={c.displayName}
                    description={c.description ?? c.category}
                    state={state}
                    stateLabel={connection ? connection.status : 'Not connected'}
                    onClick={() => setSelected({ kind: 'connectivity', id: c.id })}
                  />
                );
              })}
              {infraCloud.map((c) => (
                <ConnectionCard
                  key={c.id}
                  logo={<ConnectorLogo connectorId={c.id} displayName={c.displayName} size={28} />}
                  title={c.displayName}
                  description={`Configured via ${CLOUD_ENV_HINT[c.id]}`}
                  state={c.configured ? 'live' : 'off'}
                  stateLabel={c.configured ? 'Configured' : 'Not configured'}
                  detail={c.detail}
                  onClick={() => setSelected({ kind: 'infra', id: c.id, displayName: c.displayName, configured: c.configured, detail: c.detail })}
                />
              ))}
              <ConnectionCard
                logo={<ConnectorLogo connectorId="cloudflare" displayName="Cloudflare" size={28} />}
                title="Cloudflare"
                description="DNS and edge deployment access."
                state="off"
                stateLabel="Coming soon"
                disabled
                onClick={() => setSelected({ kind: 'comingSoon', id: 'cloudflare', displayName: 'Cloudflare' })}
              />
              <ConnectionCard
                logo={<ConnectorLogo connectorId="supabase" displayName="Supabase" size={28} />}
                title="Supabase"
                description="Database and auth project access."
                state="off"
                stateLabel="Coming soon"
                disabled
                onClick={() => setSelected({ kind: 'comingSoon', id: 'supabase', displayName: 'Supabase' })}
              />
            </div>
          </div>

          <div className={styles.categorySection}>
            <h3 className={styles.categorySectionTitle}>Infrastructure</h3>
            <p className={styles.categorySectionDesc}>Servers and clusters PawOS deploys to and investigates.</p>
            <div className={styles.connectionCardGrid}>
              {infraContainers.map((c) => (
                <ConnectionCard
                  key={c.id}
                  logo={<DetectedToolIcon category="container" />}
                  title={c.displayName}
                  description={c.configured ? 'Running and authenticated on this machine.' : 'Not detected on this machine.'}
                  state={c.configured ? 'live' : 'off'}
                  stateLabel={c.configured ? 'Active' : 'Not detected'}
                  detail={c.detail}
                  onClick={() => setSelected({ kind: 'infra', id: c.id, displayName: c.displayName, configured: c.configured, detail: c.detail })}
                />
              ))}
              <ConnectionCard
                logo={<DetectedToolIcon category="ssh" />}
                title="SSH Servers"
                description="Used automatically when you ask Paw to deploy to a server."
                state="off"
                stateLabel="Coming soon"
                disabled
                onClick={() => setSelected({ kind: 'comingSoon', id: 'ssh', displayName: 'SSH Servers' })}
              />
              <ConnectionCard
                logo={<DetectedToolIcon category="cloud" />}
                title="Virtual Machines"
                description="Cloud VM provisioning across AWS, GCP, Azure, and more."
                state="off"
                stateLabel="Coming soon"
                disabled
                onClick={() => setSelected({ kind: 'comingSoon', id: 'vms', displayName: 'Virtual Machines' })}
              />
            </div>
          </div>

          <div className={styles.categorySection}>
            <h3 className={styles.categorySectionTitle}>Runtime</h3>
            <p className={styles.categorySectionDesc}>Built into PawOS itself — always available, nothing to connect.</p>
            <div className={styles.connectionCardGrid}>
              <ConnectionCard
                logo={<DetectedToolIcon category="localApplication" />}
                title="Browser"
                description="Navigate, read, and fill out pages on your behalf."
                state="live"
                stateLabel="Active"
                onClick={() => setSelected({ kind: 'runtime', id: 'browser', displayName: 'Browser', description: 'Navigate, read, and fill out pages on your behalf.' })}
              />
              <ConnectionCard
                logo={<DetectedToolIcon category="localApplication" />}
                title="Filesystem"
                description="Read, write, and organize files on this device."
                state="live"
                stateLabel="Active"
                onClick={() => setSelected({ kind: 'runtime', id: 'filesystem', displayName: 'Filesystem', description: 'Read, write, and organize files on this device.' })}
              />
              <ConnectionCard
                logo={<DetectedToolIcon category="localApplication" />}
                title="Terminal"
                description="Run allowlisted shell commands with your confirmation."
                state="live"
                stateLabel="Active"
                onClick={() => setSelected({ kind: 'runtime', id: 'terminal', displayName: 'Terminal', description: 'Run allowlisted shell commands with your confirmation.' })}
              />
              {vscodeLike.map((c) => (
                <ConnectionCard
                  key={c.id}
                  logo={<DetectedToolIcon category="localApplication" />}
                  title={c.displayName}
                  description="Open projects and files directly in the editor."
                  state="live"
                  stateLabel="Detected"
                  onClick={() => setSelected({ kind: 'runtime', id: c.id, displayName: c.displayName, description: 'Open projects and files directly in the editor.' })}
                />
              ))}
            </div>
          </div>

          {profiles.length > 0 && (
            <div className={styles.categorySection}>
              <h3 className={styles.categorySectionTitle}>Deployment profiles</h3>
              <p className={styles.categorySectionDesc}>Saved deployment targets — where PawOS deploys to when you ask it to.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profiles.map((p) => (
                  <div key={p.id} className={styles.card} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--pawos-text-secondary)' }}>
                        {p.config.kind === 'managedPlatform' ? `Managed platform · ${p.config.connectorId}` : `SSH · ${p.config.host}`}
                      </div>
                    </div>
                    {p.isDefault && <LiveStatusPill state="live" label="Default" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {pageError && <p style={{ color: '#e08c8c', fontSize: 12.5 }}>{pageError}</p>}

      {selected?.kind === 'connectivity' && (() => {
        const c = connectors.find((x) => x.id === selected.id);
        if (!c) return null;
        const connection = connectionFor(c.id);
        const busy = busyConnectorId === c.id;
        const additionalFields = c.apiTokenHelp?.additionalFields ?? [];
        return (
          <SlideOver title={c.displayName} subtitle={c.description ?? c.category} onClose={() => setSelected(null)}>
            <LiveStatusPill state={connectionLiveState(connection?.status ?? 'notConnected')} label={connection ? connection.status : 'Not connected'} />
            <div style={{ marginTop: 16 }}>
              {connection ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={styles.chip} disabled={busy} onClick={() => checkHealth(c.id, connection.id)}>
                    Check health
                  </button>
                  <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => disconnect(c.id, connection.id)}>
                    Disconnect
                  </button>
                </div>
              ) : c.authMethod === 'apiToken' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {additionalFields.map((field) => (
                    <input
                      key={field.name}
                      type={field.type === 'password' ? 'password' : 'text'}
                      style={fieldInputStyle}
                      placeholder={field.label}
                      value={extraFieldInputs[c.id]?.[field.name] ?? ''}
                      onChange={(e) =>
                        setExtraFieldInputs((prev) => ({
                          ...prev,
                          [c.id]: { ...prev[c.id], [field.name]: e.target.value },
                        }))
                      }
                    />
                  ))}
                  <input
                    type="password"
                    style={fieldInputStyle}
                    placeholder={c.apiTokenHelp?.fieldLabel ?? 'API token'}
                    value={tokenInputs[c.id] ?? ''}
                    onChange={(e) => setTokenInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy || !(tokenInputs[c.id] ?? '').trim()}
                    onClick={() => connectWithApiToken(c)}
                  >
                    {busy ? 'Connecting…' : 'Connect'}
                  </button>
                  {c.apiTokenHelp?.instructionsUrl && (
                    <a href={c.apiTokenHelp.instructionsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--pawos-accent)' }}>
                      Where do I find this?
                    </a>
                  )}
                </div>
              ) : c.authMethod === 'oauth2' ? (
                <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => connectOAuth(c.id)}>
                  {busy ? 'Waiting for you to finish signing in…' : `Connect ${c.displayName}`}
                </button>
              ) : (
                <p className={styles.cardBody}>This connector's authentication method isn't supported from this page yet.</p>
              )}
              {rowErrors[c.id] && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{rowErrors[c.id]}</p>}
            </div>
          </SlideOver>
        );
      })()}

      {selected?.kind === 'infra' && (
        <SlideOver title={selected.displayName} subtitle={selected.configured ? 'Configured' : 'Not configured'} onClose={() => setSelected(null)}>
          <LiveStatusPill state={selected.configured ? 'live' : 'off'} label={selected.configured ? 'Configured' : 'Not configured'} />
          <p className={styles.cardBody} style={{ marginTop: 14 }}>
            {CLOUD_ENV_HINT[selected.id]
              ? <>Set <code>{CLOUD_ENV_HINT[selected.id]}</code> in your environment, then restart PawOS — or ask Paw to help you connect it.</>
              : selected.configured
              ? 'Detected and authenticated on this machine.'
              : 'Not detected on this machine yet.'}
          </p>
          {selected.detail && <p className={styles.cardBody} style={{ marginTop: 8 }}>{selected.detail}</p>}
        </SlideOver>
      )}

      {selected?.kind === 'runtime' && (
        <SlideOver title={selected.displayName} subtitle="Built-in capability" onClose={() => setSelected(null)}>
          <LiveStatusPill state="live" label="Active" />
          <p className={styles.cardBody} style={{ marginTop: 14 }}>{selected.description}</p>
        </SlideOver>
      )}

      {selected?.kind === 'comingSoon' && (
        <SlideOver title={selected.displayName} subtitle="Coming soon" onClose={() => setSelected(null)}>
          <LiveStatusPill state="off" label="Not built yet" />
          <p className={styles.cardBody} style={{ marginTop: 14 }}>
            {selected.displayName} isn't wired up yet — this card is here so you know it's planned.
          </p>
        </SlideOver>
      )}
    </div>
  );
}
