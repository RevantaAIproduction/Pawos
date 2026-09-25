import React, { useMemo } from 'react';
import styles from '../dashboard.module.css';
import type { ExecutionRecord } from '../../../../shared/actions/ExecutionRecordTypes';
import { buildWorkRecord } from '../../../../shared/actions/WorkRecord';
import { MarkdownView } from './MarkdownView';
import type { WorkRecordBlockedSummary } from '../../../../shared/actions/WorkRecordTypes';

function formatDate(ts: number | undefined): string {
  return ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not recorded';
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return 'In progress';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function BlockedWorkPanel({ blocked, isFailed }: { blocked: WorkRecordBlockedSummary; isFailed: boolean }) {
  return (
    <div className={styles.blockedPanel}>
      <div className={styles.blockedPanelHeader}>
        <span className={styles.statusBadge} data-status={isFailed ? 'failed' : 'abandoned'}>
          {isFailed ? 'Work Failed' : 'Work Stopped'}
        </span>
      </div>

      {blocked.reason && (
        <div className={styles.blockedPanelSection}>
          <h4 className={styles.cardTitle}>Why</h4>
          <p className={styles.cardBody}>{blocked.reason}</p>
        </div>
      )}

      <div className={styles.blockedPanelSection}>
        <h4 className={styles.cardTitle}>What PawOS completed before stopping</h4>
        {blocked.completedSteps.length > 0 ? (
          <ul className={styles.workRecordList}>
            {blocked.completedSteps.map((step, index) => (
              <li key={`${step}-${index}`}>[done] {step}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.cardBody}>No steps were recorded as completed.</p>
        )}
      </div>

      <div className={styles.blockedPanelSection}>
        <h4 className={styles.cardTitle}>What PawOS could not complete</h4>
        <ul className={styles.workRecordList}>
          {blocked.incompleteAreas.map((item) => (
            <li key={item.label}>
              {item.status === 'blocked' ? '⛔' : '○'} {item.label} — {item.status === 'blocked' ? 'Blocked' : 'Not executed'}
            </li>
          ))}
        </ul>
      </div>

      {blocked.nextAction && (
        <div className={styles.blockedPanelSection}>
          <h4 className={styles.cardTitle}>Next action</h4>
          <p className={styles.cardBody}>{blocked.nextAction}</p>
        </div>
      )}
    </div>
  );
}

/** One Work History record: header, what was asked, the result, the workspace, why it stopped (if it
 *  did), and the final summary — a single page, no per-evidence tabs. */
export function WorkRecordDetail({ record }: { record: ExecutionRecord }) {
  const work = useMemo(() => buildWorkRecord(record), [record]);
  const workspace = record.projectId ?? record.commandEvidence?.find((c) => c.cwd)?.cwd;
  const finalSummary = record.summary || work.completion.reason;

  return (
    <div className={styles.workRecordShell}>
      <div className={styles.workRecordHeader}>
        <div>
          <span className={styles.statusBadge} data-status={record.status}>{work.state}</span>
          <h2 className={styles.workRecordTitle}>{work.request.normalizedGoal || '(untitled work)'}</h2>
          <p className={styles.cardBody}>
            Started {formatDate(work.startedAt)} · {formatDuration(work.durationMs)}
            {record.runtime ? ` · ${record.runtime}` : ''}
            {typeof work.usage.pawComputeUsed === 'number' ? ` · ${work.usage.pawComputeUsed} Paw Compute` : ''}
          </p>
        </div>
      </div>

      <div className={styles.workRecordPanel}>
        <div className={styles.workRecordGrid}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>What Paw Did</h3>
            <p className={styles.cardBody}>{work.request.original || 'No request text recorded.'}</p>
          </div>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Result</h3>
            <p className={styles.cardBody}>{work.completion.status}</p>
            {work.completion.reason && <p className={styles.cardBody}>Reason: {work.completion.reason}</p>}
            {work.completion.nextAction && <p className={styles.cardBody}>Next action: {work.completion.nextAction}</p>}
          </div>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Workspace</h3>
            <p className={styles.cardBody}>{workspace ?? 'Not captured'}</p>
          </div>
        </div>
        {work.blocked && <BlockedWorkPanel blocked={work.blocked} isFailed={work.completion.status === 'FAILED'} />}
        {finalSummary && (
          <div className={styles.card} style={{ marginTop: 16 }}>
            <h3 className={styles.cardTitle}>Summary</h3>
            <MarkdownView text={finalSummary} />
          </div>
        )}
      </div>
    </div>
  );
}
