import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { useCompanionProfiles } from '../../companion/manager/useCompanionProfiles';
import { useExecutionHistory } from '../../conversation/useExecutionHistory';
import { organizationService } from '../../organization/OrganizationService';
import {
  AccountIcon,
  DesktopIcon,
  SettingsIcon,
  AIIcon,
  ShieldIcon,
  SecurityIcon,
  BrowserToolsIcon,
  CardIcon,
  TerminalIcon,
  PlugIcon,
  ChevronRightIcon,
  CompanionIcon,
  OrganizationIcon,
  RefreshIcon,
  WorkIcon,
} from './NavIcons';
import { ConnectorLogo } from './ConnectorIcons';
import { LiveStatusPill } from './LiveStatusPill';
import type { AuthUser } from '../../auth/AuthTypes';
import type { SettingsTab } from './sections/SettingsSection';

interface CategoryDef {
  tab: SettingsTab;
  title: string;
  description: string;
  icon: React.ComponentType;
  color: string;
}

const CATEGORIES: CategoryDef[] = [
  { tab: 'Account', title: 'Account', description: 'Profile, email, password, and your organization.', icon: AccountIcon, color: '#8b7bff' },
  { tab: 'Devices', title: 'Devices', description: 'This device, active sessions, and paired phones.', icon: DesktopIcon, color: '#38bdf8' },
  { tab: 'Preferences', title: 'Preferences', description: 'General (theme, language), appearance, voice, and notifications.', icon: SettingsIcon, color: '#fb923c' },
  { tab: 'AI', title: 'AI', description: 'Your default Paw model and what your plan unlocks.', icon: AIIcon, color: '#34d399' },
  { tab: 'Privacy', title: 'Privacy', description: 'What PawOS stores, and your recording consent.', icon: ShieldIcon, color: '#60a5fa' },
  { tab: 'Security', title: 'Security', description: 'Password, sessions, and account protection.', icon: SecurityIcon, color: '#f87171' },
  { tab: 'Browser Tools', title: 'Browser Tools', description: 'Browser automation preferences — coming soon.', icon: BrowserToolsIcon, color: '#22d3ee' },
  { tab: 'Connections', title: 'Connections', description: 'Cloud services, infrastructure, and local tools PawOS acts through.', icon: PlugIcon, color: '#c084fc' },
  { tab: 'Billing', title: 'Billing', description: 'Plan, credits, and usage.', icon: CardIcon, color: '#facc15' },
  { tab: 'Developers', title: 'Developers', description: 'Coding mode, infrastructure connectors, and updates.', icon: TerminalIcon, color: '#94a3b8' },
];

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EXECUTION_STATUS_COLOR: Record<string, string> = {
  completed: '#7fd88f',
  failed: '#e08c8c',
  abandoned: 'var(--pawos-text-secondary)',
  in_progress: '#e0c88c',
};

/**
 * The Settings landing page — search + a status strip of real, currently-available signals, a grid
 * of category tiles (colored icon + one-line honest description), and a right rail of real recent
 * activity plus navigation shortcuts. Replaces defaulting straight into the Account tab's content.
 *
 * Every number here is either read from a real store/IPC call or omitted — no fabricated "100%
 * healthy" or "synced 3m ago" style filler, matching this app's existing honest-placeholder
 * convention (see PrivacySection, UpdatesSection, AISettingsPage for the same posture).
 */
export function SettingsHome({
  user,
  onSelectTab,
  onOpenCompanionStudio,
}: {
  user: AuthUser;
  onSelectTab: (tab: SettingsTab) => void;
  onOpenCompanionStudio: () => void;
}) {
  const { active: activeCompanion } = useCompanionProfiles();
  const { records } = useExecutionHistory();
  const [query, setQuery] = useState('');
  const [companionEnabled, setCompanionEnabled] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [orgSummary, setOrgSummary] = useState<{ name: string; tier: string } | null | undefined>(undefined);
  const [connectorSummary, setConnectorSummary] = useState<{ connected: number; total: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ipc.companionIsEnabled().then(setCompanionEnabled).catch(() => setCompanionEnabled(null));
    ipc.systemGetAppVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    if (user.isGuest) {
      setOrgSummary(null);
      return;
    }
    organizationService
      .getMyOrganizations()
      .then((orgs) => setOrgSummary(orgs[0] ? { name: orgs[0].name, tier: orgs[0].tier } : null))
      .catch(() => setOrgSummary(null));
  }, [user.isGuest]);

  useEffect(() => {
    Promise.all([ipc.connectivityListConnectors(), ipc.connectivityListConnections({ userId: user.id })])
      .then(([connectorsResult, connectionsResult]) => {
        if (!connectorsResult.ok || !connectionsResult.ok) return;
        const total = connectorsResult.data.filter((c) => c.authMethod !== 'none').length;
        const connected = connectionsResult.data.filter((c) => c.status === 'connected').length;
        setConnectorSummary({ connected, total });
      })
      .catch(() => {});
  }, [user.id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [query]);

  const recentExecutions = useMemo(() => [...records].sort((a, b) => b.startedAt - a.startedAt).slice(0, 4), [records]);

  return (
    <div style={{ position: 'relative' }}>
      <div className={styles.heroGlow} />
      <p className={styles.cardBody} style={{ marginBottom: 16, fontSize: 13, position: 'relative' }}>
        Configure how PawOS works for you{orgSummary ? ' and your organization' : ''}.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, position: 'relative' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search settings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.settingsSearchInput}
          />
          <span className={styles.settingsSearchShortcut}>Ctrl K</span>
        </div>
      </div>

      <div className={styles.settingsStatusStrip} style={{ position: 'relative' }}>
        <div className={styles.settingsStatusItem}>
          <span className={styles.settingsStatusIcon}>
            <CompanionIcon />
          </span>
          <div>
            <div className={styles.settingsStatusLabel}>Companion</div>
            <LiveStatusPill
              state={companionEnabled ? 'live' : companionEnabled === null ? 'idle' : 'off'}
              label={<>{activeCompanion?.name ?? 'Paw'} · {companionEnabled === null ? '…' : companionEnabled ? 'Enabled' : 'Not enabled'}</>}
            />
          </div>
        </div>

        <div className={styles.settingsStatusItem}>
          <span className={styles.settingsStatusIcon}>
            <OrganizationIcon />
          </span>
          <div>
            <div className={styles.settingsStatusLabel}>Organization</div>
            <LiveStatusPill
              state={orgSummary ? 'live' : 'off'}
              label={orgSummary === undefined ? '…' : orgSummary ? orgSummary.name : user.isGuest ? 'Guest session' : 'No organization'}
            />
          </div>
        </div>

        <div className={styles.settingsStatusItem}>
          <span className={styles.settingsStatusIcon}>
            <PlugIcon />
          </span>
          <div>
            <div className={styles.settingsStatusLabel}>Connections</div>
            <LiveStatusPill
              state={connectorSummary && connectorSummary.connected > 0 ? 'live' : 'idle'}
              label={connectorSummary ? `${connectorSummary.connected} connected` : '…'}
            />
          </div>
        </div>

        <div className={styles.settingsStatusItem}>
          <span className={styles.settingsStatusIcon}>
            <RefreshIcon />
          </span>
          <div>
            <div className={styles.settingsStatusLabel}>Version</div>
            <div className={styles.settingsStatusValue}>{appVersion ?? '…'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className={styles.subheading} style={{ marginTop: 0 }}>Categories</h4>
          <div className={styles.settingsHomeGrid}>
            {filteredCategories.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.tab}
                  type="button"
                  className={styles.settingsHomeTile}
                  style={{ backgroundImage: `radial-gradient(140px circle at 88% -10%, ${c.color}22, transparent 70%)` }}
                  onClick={() => onSelectTab(c.tab)}
                >
                  {c.tab === 'Connections' ? (
                    <span className={styles.settingsHomeTileLogos}>
                      <ConnectorLogo connectorId="github" displayName="GitHub" size={30} />
                      <ConnectorLogo connectorId="jira" displayName="Jira" size={30} />
                      <ConnectorLogo connectorId="googleWorkspace" displayName="Google Workspace" size={30} />
                    </span>
                  ) : (
                    <span className={styles.settingsHomeTileIcon} style={{ background: `${c.color}26`, color: c.color }}>
                      <Icon />
                    </span>
                  )}
                  <span className={styles.settingsHomeTileTitle}>{c.title}</span>
                  <span className={styles.settingsHomeTileDesc}>{c.description}</span>
                  <span className={styles.settingsHomeTileView} style={{ color: c.color }}>
                    View <ChevronRightIcon />
                  </span>
                </button>
              );
            })}
            {filteredCategories.length === 0 && (
              <p className={styles.cardBody}>No settings match "{query}".</p>
            )}
          </div>
        </div>

        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Recent activity</h3>
            {recentExecutions.length === 0 ? (
              <p className={styles.cardBody} style={{ marginTop: 6 }}>Nothing yet — completed tasks will show up here.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {recentExecutions.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                    <span
                      className={styles.settingsQuickActionIcon}
                      style={{ color: EXECUTION_STATUS_COLOR[r.status] ?? 'var(--pawos-text-secondary)', marginTop: 1 }}
                    >
                      <WorkIcon />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: 'var(--pawos-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.goal}</div>
                      <div style={{ color: 'var(--pawos-text-secondary)' }}>{relativeTime(r.startedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Quick actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              <button type="button" className={styles.settingsQuickAction} onClick={() => onSelectTab('Connections')}>
                <span className={styles.settingsQuickActionIcon} style={{ color: '#c084fc' }}><PlugIcon /></span>
                <span style={{ flex: 1 }}>Connect a service</span>
                <ChevronRightIcon />
              </button>
              <button type="button" className={styles.settingsQuickAction} onClick={() => onSelectTab('Billing')}>
                <span className={styles.settingsQuickActionIcon} style={{ color: '#facc15' }}><CardIcon /></span>
                <span style={{ flex: 1 }}>View plan &amp; credits</span>
                <ChevronRightIcon />
              </button>
              <button type="button" className={styles.settingsQuickAction} onClick={() => onSelectTab('Account')}>
                <span className={styles.settingsQuickActionIcon} style={{ color: '#8b7bff' }}><OrganizationIcon /></span>
                <span style={{ flex: 1 }}>Manage organization</span>
                <ChevronRightIcon />
              </button>
              <button type="button" className={styles.settingsQuickAction} onClick={onOpenCompanionStudio}>
                <span className={styles.settingsQuickActionIcon} style={{ color: '#34d399' }}><CompanionIcon /></span>
                <span style={{ flex: 1 }}>Open Companion Studio</span>
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
