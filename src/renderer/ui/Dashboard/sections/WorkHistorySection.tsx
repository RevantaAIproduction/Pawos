import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { useExecutionHistory } from '../../../conversation/useExecutionHistory';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { ExecutionRecord } from '../../../../shared/actions/ExecutionRecordTypes';
import { WorkRecordDetail } from './WorkRecordDetail';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return 'In progress';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_LABELS: Record<ExecutionRecord['status'], string> = {
  in_progress: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  abandoned: 'Stopped',
};

/**
 * Best-effort workspace label — real evidence only (projectId, or the
 * folder a real command/file evidence entry actually touched). Never
 * fabricated; a record with no such evidence simply shows no workspace.
 */
function workspaceLabel(record: ExecutionRecord): string | null {
  if (record.projectId) return record.projectId;
  const cwd = record.commandEvidence?.find((c) => c.cwd)?.cwd;
  if (cwd) {
    const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] || cwd;
  }
  const firstPath = record.fileEvidence?.[0]?.relativePath ?? record.fileEvidence?.[0]?.path;
  if (firstPath) {
    const parts = firstPath.split(/[\\/]/);
    return parts.length > 1 ? parts[0] ?? null : null;
  }
  return null;
}

function evidenceCounts(record: ExecutionRecord) {
  const commands = record.commandEvidence?.length ?? record.commandsExecuted.length;
  const files = record.fileEvidence?.length ?? record.filesCreated.length + record.filesModified.length;
  const tests = (record.verificationEvidence ?? []).filter((v) => v.type === 'TEST').length;
  const builds = (record.verificationEvidence ?? []).filter((v) => v.type === 'BUILD').length;
  return { commands, files, tests, builds };
}

export function WorkHistorySection({ selectedWorkId }: { selectedWorkId?: string | null }) {
  const { records } = useExecutionHistory();
  const ipc = useIpcBridge();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedWorkId) setActiveId(selectedWorkId);
  }, [selectedWorkId]);

  const handleSelectExecution = (executionId: string) => {
    setActiveId(executionId);
    ipc.executionSetSelected?.(executionId).catch(() => {});
  };

  const detail = records.find((r) => r.id === activeId) ?? null;

  if (records.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No completed work yet</h3>
        <p className={styles.emptyBody}>
          Every real request Paw carries out becomes an inspectable Work Record here.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.mailPreview}>
      <div className={styles.mailPreviewList}>
        <div className={styles.workRecordCardList}>
          {records.map((r) => {
            const workspace = workspaceLabel(r);
            const counts = evidenceCounts(r);
            return (
              <button
                key={r.id}
                type="button"
                className={`${styles.workRecordCard} ${activeId === r.id ? styles.workRecordCardActive : ''}`}
                onClick={() => handleSelectExecution(r.id)}
              >
                <div className={styles.workRecordCardTop}>
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.workRecordCardTitle}>{r.goal || '(untitled request)'}</div>
                    {workspace && <div className={styles.workRecordCardWorkspace}>{workspace}</div>}
                  </div>
                  <span className={styles.statusBadge} data-status={r.status}>{STATUS_LABELS[r.status]}</span>
                </div>
                <div className={styles.workRecordCardMetaRow}>
                  <span>{formatDate(r.startedAt)}</span>
                  <span className={styles.workRecordCardMetaDot} />
                  <span>{formatDuration(r.durationMs)}</span>
                  {r.runtime && (
                    <>
                      <span className={styles.workRecordCardMetaDot} />
                      <span>{r.runtime}</span>
                    </>
                  )}
                  {typeof r.pawComputeUsed === 'number' && (
                    <>
                      <span className={styles.workRecordCardMetaDot} />
                      <span>{r.pawComputeUsed} Paw Compute</span>
                    </>
                  )}
                </div>
                {(counts.commands > 0 || counts.files > 0 || counts.tests > 0 || counts.builds > 0) && (
                  <div className={styles.workRecordCardMetaRow}>
                    {counts.commands > 0 && <span className={styles.workRecordMetricChip}>{counts.commands} commands</span>}
                    {counts.files > 0 && <span className={styles.workRecordMetricChip}>{counts.files} files</span>}
                    {counts.builds > 0 && <span className={styles.workRecordMetricChip}>{counts.builds} builds</span>}
                    {counts.tests > 0 && <span className={styles.workRecordMetricChip}>{counts.tests} tests</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.mailPreviewFrame} style={{ padding: detail ? 20 : 0, overflowY: 'auto' }}>
        {!detail && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p className={styles.cardBody}>Select an entry to inspect its Work Record.</p>
          </div>
        )}
        {detail && <WorkRecordDetail record={detail} />}
      </div>
    </div>
  );
}
