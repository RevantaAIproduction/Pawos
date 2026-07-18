import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { useExecutionHistory } from '../../../conversation/useExecutionHistory';
import type { ExecutionRecord } from '../../../../shared/actions/ExecutionRecordTypes';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_LABELS: Record<ExecutionRecord['status'], string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  abandoned: 'Abandoned',
};

/**
 * Read-only Timeline of completed work — every ExecutionRecord Paw's
 * internal Execution Supervisor built while carrying out a real request.
 * Nothing here edits a record; it only ever arrives already-finished.
 */
export function WorkHistorySection() {
  const { records } = useExecutionHistory();
  const [activeId, setActiveId] = useState<string | null>(null);
  const detail = records.find((r) => r.id === activeId) ?? null;

  if (records.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No completed work yet</h3>
        <p className={styles.emptyBody}>
          Every real request Paw carries out — across applications, commands, and files — becomes an entry here once
          it's done, with what was verified along the way.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.mailPreview}>
      <div className={styles.mailPreviewList}>
        {records.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`${styles.mailPreviewItem} ${activeId === r.id ? styles.mailPreviewItemActive : ''}`}
            onClick={() => setActiveId(r.id)}
          >
            <div>{r.goal || '(untitled request)'}</div>
            <div style={{ fontSize: 11, color: '#6c6c74', marginTop: 2 }}>
              {formatDate(r.startedAt)} · {STATUS_LABELS[r.status]} · {formatDuration(r.durationMs)}
            </div>
          </button>
        ))}
      </div>

      <div className={styles.mailPreviewFrame} style={{ padding: detail ? 20 : 0, overflowY: 'auto' }}>
        {!detail && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p className={styles.cardBody}>Select an entry to see what it involved.</p>
          </div>
        )}
        {detail && (
          <>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{detail.goal || '(untitled request)'}</h2>
            <p className={styles.cardBody} style={{ marginBottom: 14 }}>
              {formatDate(detail.startedAt)} · {STATUS_LABELS[detail.status]} · {formatDuration(detail.durationMs)}
            </p>

            {detail.summary && <p className={styles.cardBody} style={{ marginBottom: 18 }}>{detail.summary}</p>}

            {detail.applicationsUsed.length > 0 && (
              <p className={styles.cardBody} style={{ marginBottom: 8 }}>
                <strong>Applications:</strong> {detail.applicationsUsed.join(', ')}
              </p>
            )}
            {detail.aiWorkersUsed.length > 0 && (
              <p className={styles.cardBody} style={{ marginBottom: 8 }}>
                <strong>AI workers:</strong> {detail.aiWorkersUsed.join(', ')}
              </p>
            )}
            {detail.commandsExecuted.length > 0 && (
              <p className={styles.cardBody} style={{ marginBottom: 8 }}>
                <strong>Commands:</strong> {detail.commandsExecuted.join(', ')}
              </p>
            )}
            {detail.filesCreated.length > 0 && (
              <p className={styles.cardBody} style={{ marginBottom: 8 }}>
                <strong>Files created:</strong> {detail.filesCreated.join(', ')}
              </p>
            )}
            {detail.filesModified.length > 0 && (
              <p className={styles.cardBody} style={{ marginBottom: 8 }}>
                <strong>Files modified:</strong> {detail.filesModified.join(', ')}
              </p>
            )}
            {detail.verificationResults.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className={styles.cardBody} style={{ marginBottom: 6 }}>
                  <strong>Verification:</strong>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detail.verificationResults.map((v, i) => (
                    <div key={i} style={{ fontSize: 12, color: v.ok ? '#7ee787' : '#ff8a8a' }}>
                      {v.ok ? '✓' : '✗'} {v.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detail.recoveryAttempts > 0 && (
              <p className={styles.cardBody} style={{ marginTop: 14 }}>
                Recovery attempts: {detail.recoveryAttempts}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
