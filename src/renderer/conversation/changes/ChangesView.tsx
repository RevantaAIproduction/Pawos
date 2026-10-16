import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import type { CodeChangeDiff, CodeChangeEntry, CodeChangeSummary } from '../../../shared/actions/CodeChangeTypes';
import { revertAvailability } from '../../../shared/actions/CodeChangeTypes';
import type { TaskCenterEntry } from '../tasksCenterModel';
import { STATUS_LABEL } from '../tasksCenterModel';
import { ROW_PAGE, buildDiffRows, groupChangedFiles, splitPath, toUnifiedDiff } from './diffViewModel';
import { languageForPath } from './syntaxColorizer';
import styles from './changesView.module.css';

/**
 * The Worktree tab's Changes view: the file changes one task made in this project, live. The list
 * and counts come from the task's change ledger (main process); each diff is computed there too,
 * from the file as it was before the task first touched it to how it is now. Revert is per file and
 * refuses — without writing anything — when the file changed after the task (see CodeChangeLedger).
 */

const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
/**
 * A task belongs to this project when its own project folder is this project — or, for a task that
 * had no project folder, when its file history is rooted exactly here. Never by a shared ancestor.
 */
export function taskInProject(task: Pick<TaskCenterEntry, 'projectFolder'>, ledgerRoot: string, projectFolder: string): boolean {
  if (task.projectFolder) return normalize(task.projectFolder) === normalize(projectFolder);
  return normalize(ledgerRoot) === normalize(projectFolder);
}

const STATUS_MARK: Record<string, string> = { created: 'A', modified: 'M', renamed: 'R', deleted: 'D', unchanged: '·' };

type DiffState = { status: 'idle' | 'loading' | 'ready' | 'error'; diff: CodeChangeDiff | null; message?: string };

export interface ChangesViewProps {
  projectFolder: string | null;
  tasks: TaskCenterEntry[];
  summaries: ReadonlyMap<string, CodeChangeSummary>;
  selectedExecutionId: string | null;
  onSelectExecution: (executionId: string | null) => void;
  onOpenFile: (absPath: string) => void;
}

export function ChangesView({ projectFolder, tasks, summaries, selectedExecutionId, onSelectExecution, onOpenFile }: ChangesViewProps) {
  // This project's tasks that recorded file changes, newest first.
  const projectTasks = useMemo(() => {
    if (!projectFolder) return [];
    return tasks.filter((task) => {
      const summary = summaries.get(task.executionId);
      if (!summary || summary.entries.length === 0) return false;
      return taskInProject(task, summary.projectRoot, projectFolder);
    });
  }, [tasks, summaries, projectFolder]);

  const executionId = selectedExecutionId && summaries.has(selectedExecutionId) ? selectedExecutionId : projectTasks[0]?.executionId ?? null;
  const summary = executionId ? summaries.get(executionId) ?? null : null;
  const task = executionId ? tasks.find((t) => t.executionId === executionId) ?? null : null;

  const [filter, setFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const groups = useMemo(() => groupChangedFiles(summary?.entries ?? [], filter), [summary, filter]);
  const visibleEntries = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const entry: CodeChangeEntry | null = visibleEntries.find((e) => e.path === selectedPath) ?? visibleEntries[0] ?? null;

  const [fullFile, setFullFile] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);
  const [diffState, setDiffState] = useState<DiffState>({ status: 'idle', diff: null });
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [reverting, setReverting] = useState(false);
  const diffRef = useRef<HTMLDivElement>(null);
  const shownKey = useRef<string | null>(null);

  // A different file (or task): start at the top with the default view. The same file updated live: keep the scroll.
  const fileKey = executionId && entry ? `${executionId}::${entry.path}` : null;
  useEffect(() => {
    if (fileKey === shownKey.current) return;
    shownKey.current = fileKey;
    setFullFile(false);
    setExpanded(new Set());
    setRowLimit(ROW_PAGE);
    setConfirmRevert(false);
    setNotice(null);
    if (diffRef.current) diffRef.current.scrollTop = 0;
  }, [fileKey]);

  // Fetch the diff whenever the file, its latest recorded change (live updates) or the view mode changes.
  const lastSeq = entry?.lastSeq ?? 0;
  useEffect(() => {
    if (!executionId || !entry) {
      setDiffState({ status: 'idle', diff: null });
      return undefined;
    }
    let alive = true;
    setDiffState((previous) => ({ ...previous, status: previous.diff ? 'ready' : 'loading' }));
    ipc
      .codeChangesDiff(executionId, entry.path, fullFile ? 1_000_000 : 3)
      .then((diff) => {
        if (alive) setDiffState({ status: 'ready', diff });
      })
      .catch(() => {
        if (alive) setDiffState({ status: 'error', diff: null, message: 'Couldn’t load this diff.' });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry identity changes on every reload; path + lastSeq is what matters
  }, [executionId, entry?.path, lastSeq, fullFile]);

  const diff = diffState.diff && diffState.diff.path === entry?.path ? diffState.diff : null;
  // Only the rows shown (up to the current page) are syntax-colored.
  const rows = useMemo(() => (diff && diff.ok && entry ? buildDiffRows(diff, languageForPath(entry.path), expanded, rowLimit) : []), [diff, entry, expanded, rowLimit]);
  const taskActive = !!task && (task.status === 'running' || task.status === 'cancelling');
  const revert = entry
    ? taskActive
      ? ({ ok: false, message: 'Revert becomes available once this task has finished, so nothing it is still writing gets overwritten.' } as const)
      : revertAvailability(entry)
    : null;

  const doRevert = async () => {
    if (!executionId || !entry) return;
    setReverting(true);
    setConfirmRevert(false);
    try {
      const result = await ipc.codeChangesRevert(executionId, entry.path);
      setNotice(result.ok ? { tone: 'ok', text: `Reverted ${entry.path} to how it was before this task.` } : { tone: 'warn', text: result.message });
    } catch {
      setNotice({ tone: 'warn', text: 'Couldn’t revert this file.' });
    } finally {
      setReverting(false);
    }
  };

  const copyDiff = async () => {
    if (!diff || !diff.ok) return;
    try {
      await navigator.clipboard.writeText(toUnifiedDiff(diff));
      setNotice({ tone: 'ok', text: 'Diff copied.' });
    } catch {
      setNotice({ tone: 'warn', text: 'Couldn’t copy to the clipboard.' });
    }
  };

  if (!projectFolder) return null;

  if (projectTasks.length === 0 && !summary) {
    const unavailable = tasks.filter((t) => t.changeHistory === 'unavailable' && t.projectFolder !== null && normalize(t.projectFolder) === normalize(projectFolder)).length;
    return (
      <section className={styles.root} data-testid="changes-view">
        <h3 className={styles.heading}>Changes</h3>
        <p className={styles.empty}>No file changes recorded for this project yet. When PawOS changes files here, each change appears as it happens.</p>
        {unavailable > 0 && (
          <p className={styles.muted}>
            {unavailable} earlier task{unavailable === 1 ? '' : 's'} in this project changed files, but their file history isn’t available (recorded before file tracking, or cleared).
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.root} data-testid="changes-view">
      <div className={styles.header}>
        <h3 className={styles.heading}>Changes</h3>
        <label className={styles.taskPicker}>
          <span className={styles.srOnly}>Task</span>
          <select value={executionId ?? ''} onChange={(event) => onSelectExecution(event.currentTarget.value || null)} className={styles.select}>
            {projectTasks.map((t) => (
              <option key={t.executionId} value={t.executionId}>
                {t.goal.length > 60 ? `${t.goal.slice(0, 57)}…` : t.goal} — {STATUS_LABEL[t.status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {summary && (
        <p className={styles.totals}>
          {summary.totals.files} file{summary.totals.files === 1 ? '' : 's'} · <span className={styles.added}>+{summary.totals.added}</span> <span className={styles.removed}>−{summary.totals.removed}</span>
          {task && (task.status === 'running' || task.status === 'cancelling') && <span className={styles.live}> · updating live</span>}
          {summary.untrackedCommandCount > 0 && (
            <span className={styles.muted}> · commands also ran — files they changed aren’t attributed to this task</span>
          )}
        </p>
      )}

      <div className={styles.body}>
        <div className={styles.fileColumn}>
          <input
            className={styles.filter}
            type="search"
            placeholder="Filter files"
            aria-label="Filter changed files"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          {groups.length === 0 && <p className={styles.empty}>{filter ? 'No changed files match.' : 'No net changes — every file is back as it was.'}</p>}
          {groups.map((group) => (
            <div key={group.id} className={styles.group}>
              <div className={styles.groupLabel}>
                {group.label} <span className={styles.muted}>{group.entries.length}</span>
              </div>
              <ul className={styles.fileList}>
                {group.entries.map((e) => {
                  const { name, dir } = splitPath(e.path);
                  const selected = entry?.path === e.path;
                  return (
                    <li key={e.path}>
                      <button
                        type="button"
                        className={`${styles.fileRow} ${selected ? styles.fileRowSelected : ''}`}
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => setSelectedPath(e.path)}
                        title={e.status === 'renamed' ? `${e.originalPath} → ${e.path}` : e.path}
                      >
                        <span className={`${styles.mark} ${styles[`mark_${e.status}`] ?? ''}`} aria-label={e.status}>{STATUS_MARK[e.status]}</span>
                        <span className={styles.fileName}>
                          {name}
                          {dir && <span className={styles.fileDir}>{dir}</span>}
                        </span>
                        {e.added !== null && e.removed !== null ? (
                          <span className={styles.counts}>
                            <span className={styles.added}>+{e.added}</span> <span className={styles.removed}>−{e.removed}</span>
                          </span>
                        ) : (
                          <span className={styles.muted}>hidden</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.diffColumn}>
          {entry && (
            <div className={styles.diffToolbar}>
              <span className={styles.diffPath} title={entry.path}>
                {entry.status === 'renamed' ? `${entry.originalPath} → ${entry.path}` : entry.path}
              </span>
              <div className={styles.diffActions}>
                {diff && diff.ok && (
                  <>
                    <button type="button" className={styles.button} onClick={() => setFullFile((v) => !v)} aria-pressed={fullFile}>
                      {fullFile ? 'Changes only' : 'Show all lines'}
                    </button>
                    <button type="button" className={styles.button} onClick={() => void copyDiff()}>
                      Copy diff
                    </button>
                  </>
                )}
                {entry.final.exists && summary && (
                  <button type="button" className={styles.button} onClick={() => onOpenFile(`${summary.projectRoot}/${entry.path}`)}>
                    Open file
                  </button>
                )}
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setConfirmRevert(true)}
                  disabled={!revert?.ok || reverting}
                  title={revert && !revert.ok ? revert.message : 'Put this file back as it was before this task'}
                >
                  {reverting ? 'Reverting…' : 'Revert file'}
                </button>
              </div>
            </div>
          )}

          {confirmRevert && entry && (
            <div className={styles.confirm} role="alertdialog" aria-label="Confirm revert">
              <span>Put {entry.status === 'renamed' ? entry.originalPath : entry.path} back as it was before this task? If the file changed since, nothing is overwritten.</span>
              <div className={styles.diffActions}>
                <button type="button" className={styles.button} onClick={() => void doRevert()}>
                  Revert
                </button>
                <button type="button" className={styles.button} onClick={() => setConfirmRevert(false)}>
                  Keep
                </button>
              </div>
            </div>
          )}
          {revert && !revert.ok && entry && entry.status !== 'unchanged' && <p className={styles.muted}>{revert.message}</p>}
          {notice && (
            <p className={notice.tone === 'ok' ? styles.noticeOk : styles.noticeWarn} role="status">
              {notice.text}
            </p>
          )}

          <div className={styles.diff} ref={diffRef} data-testid="diff-view">
            {!entry && <p className={styles.empty}>Select a file to see its changes.</p>}
            {entry && diffState.status === 'loading' && !diff && <p className={styles.empty}>Loading diff…</p>}
            {entry && diffState.status === 'error' && <p className={styles.noticeWarn}>{diffState.message}</p>}
            {diff && !diff.ok && <p className={styles.empty}>{diff.message}</p>}
            {diff && diff.ok && diff.hunks.length === 0 && <p className={styles.empty}>No net change — this file is exactly as it was before the task.</p>}
            {diff && diff.ok && diff.truncated && <p className={styles.muted}>This file is very long; only its first part is compared.</p>}
            {diff && diff.ok && diff.hunks.length > 0 && (
              <table className={styles.table}>
                <tbody>
                  {rows.slice(0, rowLimit).map((row) => {
                    if (row.kind === 'hunk') {
                      return (
                        <tr key={row.key} className={styles.hunkRow}>
                          <td colSpan={3}>{row.header}</td>
                        </tr>
                      );
                    }
                    if (row.kind === 'gap') {
                      return (
                        <tr key={row.key} className={styles.gapRow}>
                          <td colSpan={3}>
                            {row.groupId ? (
                              <button type="button" className={styles.gapButton} onClick={() => setExpanded((prev) => new Set(prev).add(row.groupId!))}>
                                ⋯ {row.label} — show
                              </button>
                            ) : (
                              <button type="button" className={styles.gapButton} onClick={() => setFullFile(true)}>
                                ⋯ {row.label} — show all lines
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }
                    const { line } = row;
                    return (
                      <tr key={row.key} className={line.kind === 'add' ? styles.addRow : line.kind === 'remove' ? styles.removeRow : undefined}>
                        <td className={styles.lineNo}>{line.oldLine ?? ''}</td>
                        <td className={styles.lineNo}>{line.newLine ?? ''}</td>
                        <td className={styles.code}>
                          <span className={styles.sign} aria-hidden="true">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}</span>
                          {row.tokens.map((token, index) => (
                            <span key={index} className={styles[`tok_${token.kind}`]}>
                              {token.text}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {rows.length > rowLimit && (
              <button type="button" className={styles.button} onClick={() => setRowLimit((n) => n + ROW_PAGE)}>
                Show more ({rows.length - rowLimit} more lines)
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
