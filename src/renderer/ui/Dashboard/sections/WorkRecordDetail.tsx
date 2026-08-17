import React, { useMemo, useState } from 'react';
import styles from '../dashboard.module.css';
import type { ExecutionRecord } from '../../../../shared/actions/ExecutionRecordTypes';
import { buildWorkRecord, evidenceState } from '../../../../shared/actions/WorkRecord';
import { MarkdownView, renderInlineMarkdown } from './MarkdownView';
import type {
  WorkRecordBlockedSummary,
  WorkRecordCommandEvidence,
  WorkRecordEvidenceState,
  WorkRecordFileEvidence,
  WorkRecordVerificationEvidence,
} from '../../../../shared/actions/WorkRecordTypes';

const TABS = [
  'Overview',
  'Plan',
  'Architecture',
  'Execution',
  'Commands',
  'Files',
  'Diffs',
  'Tests',
  'Preview',
  'Visual Verification',
  'Usage',
  'Final Result',
] as const;

type Tab = (typeof TABS)[number];

const EVIDENCE_STATE_LABELS: Record<WorkRecordEvidenceState, string> = {
  CAPTURED: 'Captured',
  NOT_CAPTURED: 'Not captured',
  NOT_EXECUTED: 'Not executed',
  FAILED: 'Failed',
  BLOCKED: 'Blocked',
};

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

function EmptyEvidence({ text }: { text: string }) {
  return <p className={styles.cardBody}>{text}</p>;
}

function EvidenceStateBadge({ state }: { state: WorkRecordEvidenceState }) {
  return <span className={styles.evidenceStateBadge} data-state={state}>{EVIDENCE_STATE_LABELS[state]}</span>;
}

function TabSummary({ state, note }: { state: WorkRecordEvidenceState; note?: string }) {
  return (
    <div className={styles.workRecordSummaryRow}>
      <EvidenceStateBadge state={state} />
      {note && <span className={styles.cardBody}>{note}</span>}
    </div>
  );
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
              <li key={`${step}-${index}`}>✓ {step}</li>
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

function commandRowState(item: WorkRecordCommandEvidence): WorkRecordEvidenceState {
  if (item.status === 'blocked') return 'BLOCKED';
  if (item.status === 'failed') return 'FAILED';
  return 'CAPTURED';
}

function fileRowState(item: WorkRecordFileEvidence): WorkRecordEvidenceState {
  if (item.result === 'blocked') return 'BLOCKED';
  if (item.result === 'failed') return 'FAILED';
  return 'CAPTURED';
}

function verificationRowState(item: WorkRecordVerificationEvidence): WorkRecordEvidenceState {
  if (item.status === 'failed') return 'FAILED';
  if (item.status === 'skipped' || item.status === 'not_performed') return 'NOT_EXECUTED';
  return 'CAPTURED';
}

function CommandsTab({ items, state }: { items: WorkRecordCommandEvidence[]; state: WorkRecordEvidenceState }) {
  if (items.length === 0) return <><TabSummary state={state} /><EmptyEvidence text="No commands were run during this work." /></>;
  return (
    <>
      <TabSummary state={state} />
      <div className={styles.evidenceCardList}>
        {items.map((item, index) => (
          <div key={index} className={styles.evidenceRow}>
            <div className={styles.evidenceRowTop}>
              <EvidenceStateBadge state={commandRowState(item)} />
              <span className={styles.evidenceRowMeta}>
                {item.exitCode !== undefined && item.exitCode !== null ? `exit ${item.exitCode}` : ''}
                {item.durationMs !== undefined ? ` · ${formatDuration(item.durationMs)}` : ''}
              </span>
            </div>
            <code className={styles.evidenceRowCode}>{item.command}</code>
            {item.cwd && <span className={styles.evidenceRowMeta}>cwd: {item.cwd}</span>}
            {item.output && <code className={styles.evidenceRowCode}>{item.output}</code>}
          </div>
        ))}
      </div>
    </>
  );
}

function FilesTab({ items, state }: { items: WorkRecordFileEvidence[]; state: WorkRecordEvidenceState }) {
  if (items.length === 0) return <><TabSummary state={state} /><EmptyEvidence text="No files were created or modified during this work." /></>;
  return (
    <>
      <TabSummary state={state} />
      <div className={styles.evidenceCardList}>
        {items.map((item) => (
          <div key={`${item.change}-${item.path}`} className={styles.evidenceRow}>
            <div className={styles.evidenceRowTop}>
              <EvidenceStateBadge state={fileRowState(item)} />
              <span className={styles.evidenceRowMeta}>{item.change}</span>
            </div>
            <code className={styles.evidenceRowCode}>{item.path}</code>
          </div>
        ))}
      </div>
    </>
  );
}

function VerificationTab({
  items,
  state,
  emptyText,
}: {
  items: WorkRecordVerificationEvidence[];
  state: WorkRecordEvidenceState;
  emptyText: string;
}) {
  if (items.length === 0) return <><TabSummary state={state} /><EmptyEvidence text={emptyText} /></>;
  return (
    <>
      <TabSummary state={state} />
      <div className={styles.evidenceCardList}>
        {items.map((item, index) => (
          <div key={index} className={styles.evidenceRow}>
            <div className={styles.evidenceRowTop}>
              <EvidenceStateBadge state={verificationRowState(item)} />
              <span className={styles.evidenceRowMeta}>{item.type}</span>
            </div>
            <span className={styles.cardBody}>{item.summary}</span>
            {item.failureReason && <code className={styles.evidenceRowCode}>{item.failureReason}</code>}
          </div>
        ))}
      </div>
    </>
  );
}

export function WorkRecordDetail({ record }: { record: ExecutionRecord }) {
  const work = useMemo(() => buildWorkRecord(record), [record]);
  const [tab, setTab] = useState<Tab>('Overview');

  const previewItems = useMemo(() => work.verification.items.filter((i) => i.type === 'PREVIEW'), [work.verification.items]);
  const visualItems = useMemo(() => work.verification.items.filter((i) => i.type === 'VISUAL_QA'), [work.verification.items]);
  const testItems = useMemo(
    () => work.verification.items.filter((i) => i.type !== 'PREVIEW' && i.type !== 'VISUAL_QA'),
    [work.verification.items],
  );

  const planState = evidenceState(work.plan, { neverCaptured: true });
  const architectureState = evidenceState(work.architecture, { neverCaptured: true });
  const commandsState = evidenceState(work.commands, {
    hasBlocked: (items) => items.some((i) => i.status === 'blocked'),
    hasFailed: (items) => items.some((i) => i.status === 'failed'),
  });
  const filesState = evidenceState(work.files, {
    hasBlocked: (items) => items.some((i) => i.result === 'blocked'),
    hasFailed: (items) => items.some((i) => i.result === 'failed'),
  });
  const diffsState = evidenceState(work.diffs);
  const testsState = evidenceState({ ...work.verification, items: testItems }, {
    hasFailed: (items) => items.some((i) => i.status === 'failed'),
  });
  const previewState = evidenceState({ ...work.verification, items: previewItems }, {
    hasFailed: (items) => items.some((i) => i.status === 'failed'),
  });
  const visualState = evidenceState({ ...work.verification, items: visualItems }, {
    hasFailed: (items) => items.some((i) => i.status === 'failed'),
  });

  const workspace = record.projectId ?? record.commandEvidence?.find((c) => c.cwd)?.cwd;

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

      <div className={styles.workRecordTabs}>
        {TABS.map((item) => (
          <button key={item} type="button" className={tab === item ? styles.workRecordTabActive : styles.workRecordTab} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      <div className={styles.workRecordPanel}>
        {tab === 'Overview' && (
          <>
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
          </>
        )}

        {tab === 'Plan' && (
          <>
            <TabSummary state={planState} />
            {work.plan.items.length > 0 ? (
              <ol className={styles.workRecordList}>
                {work.plan.items.map((item, index) => (
                  <li key={`${index}-${item.slice(0, 24)}`}>{renderInlineMarkdown(item, `plan-${index}-`)}</li>
                ))}
              </ol>
            ) : <EmptyEvidence text={work.plan.note ?? 'Plan not captured for this work.'} />}
          </>
        )}

        {tab === 'Architecture' && (
          <>
            <TabSummary state={architectureState} />
            {work.architecture.items.length > 0 ? (
              <MarkdownView text={work.architecture.items[0]?.diagram ?? ''} />
            ) : <EmptyEvidence text={work.architecture.note ?? 'Architecture not captured for this work.'} />}
          </>
        )}

        {tab === 'Execution' && (
          <div className={styles.workRecordTimeline}>
            {work.timeline.map((item, index) => (
              <div key={`${item.timestamp}-${index}`} className={styles.workRecordTimelineRow}>
                <span>{formatDate(item.timestamp)}</span>
                <strong>{item.label}</strong>
                <span>{item.status}{item.detail ? ` · ${item.detail}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'Commands' && <CommandsTab items={work.commands.items} state={commandsState} />}
        {tab === 'Files' && <FilesTab items={work.files.items} state={filesState} />}

        {tab === 'Diffs' && (
          work.diffs.items.length > 0 ? (
            <>
              <TabSummary state={diffsState} />
              <div className={styles.evidenceCardList}>
                {work.diffs.items.map((item, index) => (
                  <div key={index} className={styles.evidenceRow}>
                    <span className={styles.cardBody}>{item.summary}</span>
                    {item.filesChanged.map((file) => (
                      <span key={file.path} className={styles.evidenceRowMeta}>{file.path} (+{file.added}/-{file.deleted})</span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : <><TabSummary state={diffsState} /><EmptyEvidence text="No diff evidence recorded." /></>
        )}

        {tab === 'Tests' && <VerificationTab items={testItems} state={testsState} emptyText="No build, test, lint, typecheck, or validation evidence recorded." />}
        {tab === 'Preview' && <VerificationTab items={previewItems} state={previewState} emptyText="No preview evidence recorded." />}
        {tab === 'Visual Verification' && <VerificationTab items={visualItems} state={visualState} emptyText="No visual verification evidence recorded." />}

        {tab === 'Usage' && (
          <div className={styles.workRecordGrid}>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Paw Compute Used</h3>
              <p className={styles.cardBody}>{work.usage.pawComputeUsed ?? 'Not recorded'}</p>
            </div>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Remaining</h3>
              <p className={styles.cardBody}>{work.usage.pawComputeRemaining ?? 'Not recorded'}</p>
            </div>
          </div>
        )}

        {tab === 'Final Result' && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{work.completion.status}</h3>
            {record.summary || work.completion.reason ? (
              <MarkdownView text={record.summary || work.completion.reason || ''} />
            ) : (
              <p className={styles.cardBody}>No final summary recorded yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
