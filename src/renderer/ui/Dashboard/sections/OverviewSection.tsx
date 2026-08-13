import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import type { SectionId } from './index';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { ExecutionRecord } from '../../../../shared/actions/ExecutionRecordTypes';
import type { EntitlementSnapshot } from '../../../../shared/billing/BillingTypes';
import { formatPawComputeSummary, formatPlanAndRuntimeSummary } from '../../../billing/EntitlementDisplay';

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Layout only, per Phase 1: one clear primary action (enable/talk to the
 * companion), a compact status strip, and a single merged activity feed.
 * Same real data sources as before this pass.
 */
export function OverviewSection({
  onNavigate,
  companionEnabled,
  companionPending,
  companionWaking,
  onEnableCompanion,
  onDisableCompanion,
  onOpenWorkRecord,
}: {
  onNavigate: (id: SectionId) => void;
  companionEnabled: boolean;
  companionPending: boolean;
  /** True from the moment Enable resolves until the overlay's 3D asset actually finishes loading. */
  companionWaking?: boolean;
  onEnableCompanion: () => void;
  onDisableCompanion: () => void;
  onOpenWorkRecord: (id: string) => void;
}) {
  const ipc = useIpcBridge();
  const [executions, setExecutions] = useState<ExecutionRecord[] | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  const refreshExecutions = () => {
    ipc.listExecutions().then(setExecutions).catch(() => setExecutions([]));
  };

  useEffect(() => {
    refreshExecutions();
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
    ipc.getAppVersion().then(setAppVersion).catch(() => {});
    return ipc.onExecutionUpdated(refreshExecutions);
  }, []);

  const active = (executions ?? []).filter((e) => e.status === 'in_progress').sort((a, b) => b.startedAt - a.startedAt);
  const recent = (executions ?? [])
    .filter((e) => e.status !== 'in_progress')
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 6);

  const pawComputeText = formatPawComputeSummary(entitlement);
  const planText = formatPlanAndRuntimeSummary(entitlement);

  return (
    <div>
      <div className={styles.companionPanel} style={{ padding: '32px 24px' }}>
        <div className={styles.companionOrbWrap} style={{ width: 72, height: 72, marginBottom: 14 }}>
          <div className={styles.companionOrbGlow} data-on={companionEnabled} />
          <div className={styles.companionOrb} data-on={companionEnabled} />
        </div>
        <h3 className={styles.companionState} style={{ fontSize: 16 }}>
          {companionWaking ? 'Waking up your companion...' : companionEnabled ? 'Your companion is active' : 'Your companion is off'}
        </h3>
        <p className={styles.cardBody}>
          {companionWaking
            ? 'Loading its animations and voice. This only takes a few seconds.'
            : companionEnabled
              ? 'Ask it to do something, or open Talk with Paw to continue a conversation.'
              : 'Enable it to start working with Paw.'}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className={companionEnabled ? styles.dangerButton : styles.primaryButton}
            disabled={companionPending}
            onClick={companionEnabled ? onDisableCompanion : onEnableCompanion}
          >
            {companionPending ? 'Working...' : companionEnabled ? 'Disable' : 'Enable companion'}
          </button>
          {companionEnabled && !companionWaking && (
            <button type="button" className={styles.chip} onClick={() => onNavigate('companionLab')}>
              Open Companion Studio
            </button>
          )}
        </div>
      </div>

      <div className={styles.statusStrip}>
        <div className={styles.statusStripItem} onClick={() => onNavigate('analytics')} style={{ cursor: 'pointer' }}>
          <span className={styles.statusStripLabel}>Paw Compute</span>
          <span className={styles.statusStripValue}>{pawComputeText}</span>
        </div>
        <div className={styles.statusStripItem} onClick={() => onNavigate('upgrade')} style={{ cursor: 'pointer' }}>
          <span className={styles.statusStripLabel}>Plan & runtimes</span>
          <span className={styles.statusStripValue}>{planText}</span>
        </div>
        <div className={styles.statusStripItem}>
          <span className={styles.statusStripLabel}>Version</span>
          <span className={styles.statusStripValue}>{appVersion ?? '...'}</span>
        </div>
        <div className={styles.statusStripItem} onClick={() => onNavigate('projects')} style={{ cursor: 'pointer' }}>
          <span className={styles.statusStripLabel}>Projects</span>
          <span className={styles.statusStripValue}>View recent</span>
        </div>
      </div>

      <h3 className={styles.subheading}>Recent activity</h3>
      {active.length === 0 && recent.length === 0 ? (
        <div className={styles.compactEmptyState}>
          No activity yet. Enable your companion and ask it to do something to start building a history.
        </div>
      ) : (
        <div className={styles.activityList}>
          {active.map((e) => (
            <button key={e.id} type="button" className={styles.activityRow} onClick={() => onOpenWorkRecord(e.id)}>
              <span className={styles.statusBadge} data-status={e.status}>
                Running
              </span>
              <span className={styles.activityGoal}>{e.goal}</span>
              <span className={styles.activityMeta}>{timeAgo(e.startedAt)}</span>
            </button>
          ))}
          {recent.map((e) => (
            <button key={e.id} type="button" className={styles.activityRow} onClick={() => onOpenWorkRecord(e.id)}>
              <span className={styles.statusBadge} data-status={e.status}>
                {e.status === 'completed' ? 'Done' : e.status === 'failed' ? 'Failed' : 'Stopped'}
              </span>
              <span className={styles.activityGoal}>{e.goal}</span>
              <span className={styles.activityMeta}>{timeAgo(e.startedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
