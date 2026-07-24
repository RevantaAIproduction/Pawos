import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { activityDashboardService, type OrganizationActivitySummary } from '../../../organization/ActivityDashboardService';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const statLabel: React.CSSProperties = { fontSize: 11.5, color: '#96969e' };
const statValue: React.CSSProperties = { fontSize: 20, fontVariantNumeric: 'tabular-nums' };

/**
 * Phase 2 — Activity Dashboard + reporting foundation. Org-wide,
 * visible to every active member (not gated by audit.view — that stays
 * the restricted governance trail; this is team-wide transparency into
 * real work, computed live from workspace_tasks/workspace_projects/
 * credit usage, never a fabricated or estimated number.
 */
export function ActivityDashboardCard({ organizationId, orgMembers }: { organizationId: string; orgMembers: OrganizationMember[] }) {
  const [summary, setSummary] = useState<OrganizationActivitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activityDashboardService
      .getSummary(organizationId)
      .then(setSummary)
      .catch((e) => setError(getErrorMessage(e)));
  }, [organizationId]);

  function memberLabel(userId: string): string {
    const member = orgMembers.find((m) => m.userId === userId);
    return member?.displayName || member?.email || userId;
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Activity Dashboard</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Real, live-computed task and project activity across the organization — not a separate log, just today's state.
      </p>

      {!summary && !error && <p className={styles.cardBody}>Loading…</p>}

      {summary && (
        <>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const).map((status) => (
              <div key={status}>
                <div style={statLabel}>{status}</div>
                <div style={statValue}>{summary.taskCountsByStatus[status]}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['active', 'paused', 'completed', 'archived'] as const).map((status) => (
              <div key={status}>
                <div style={statLabel}>projects {status}</div>
                <div style={statValue}>{summary.projectCountsByStatus[status]}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <div>
              <div style={statLabel}>credits used this period</div>
              <div style={statValue}>{summary.creditsUsedThisPeriod}</div>
            </div>
            <div>
              <div style={statLabel}>credits remaining</div>
              <div style={statValue}>{summary.creditsRemaining ?? '—'}</div>
            </div>
          </div>

          {summary.taskCountsByAssignee.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Tasks by member</div>
              {summary.taskCountsByAssignee.map((row) => (
                <div key={row.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                  <span>{memberLabel(row.userId)}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.count}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Recently updated</div>
            {summary.recentlyUpdatedTasks.length === 0 && <p className={styles.cardBody}>No task activity yet.</p>}
            {summary.recentlyUpdatedTasks.map((task) => (
              <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>{task.title}</span>
                <span style={{ color: '#96969e' }}>
                  {task.status} · {task.progressPercent}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
