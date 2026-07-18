import React, { useEffect, useState } from 'react';
import styles from './workspaceRuntime.module.css';
import {
  TaskCard,
  getLatestScreenshot,
  getLatestVisualEvidence,
  getLatestTodoProgress,
  getLatestRunningProcesses,
  getLatestTerminalOutput,
  getLatestBuildStatus,
  getLatestTestResults,
  getLatestCodeDiffStat,
  getErrorTimeline,
  getLatestDevBrowserConsole,
} from '../conversation/TaskCard';
import type { ConversationTaskRecord } from '../conversation/ConversationTypes';
import type { WorkspaceRegionSlot } from './WorkspaceTypes';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { ActionRequest } from '../../shared/actions/ActionTypes';

/**
 * Action types that mark a task as a coding task — shape-based detection
 * (what the task actually did), not a name/goal-text guess. Only these
 * tasks get the Coding Canvas section set below; every other runtime's
 * task keeps the exact same universal regions as before.
 */
const CODING_TASK_ACTION_TYPES = new Set<ActionRequest['type']>([
  'writeFile',
  'runCommand',
  'startProcess',
  'stopProcess',
  'restartProcess',
  'listProcesses',
  'getProcessOutput',
  'analyzeProject',
  'checkProcessHealth',
  'gitStatus',
  'gitDiff',
  'gitLog',
  'gitBranch',
  'gitShow',
  'gitAdd',
  'gitCommit',
  'gitCreateBranch',
  'gitCheckout',
  'buildProject',
  'openDevBrowser',
  'refreshDevBrowser',
  'readBrowserConsole',
  'captureBrowserScreenshot',
  'getCodingMode',
  'setCodingMode',
  'analyzeProjectStructure',
  'analyzeFileImpact',
  'setTaskChecklist',
  'gitDiffStat',
  'devBrowserPreview',
]);

type ProjectStructureResult = {
  workspaceName: string;
  framework: string | null;
  language: string;
  entryPoint: string | null;
  dependencyCount: number;
  devDependencyCount: number;
  fileTreeTruncated: boolean;
};

/** Shape-detected, not action-type-detected (same discipline as TaskCard.tsx's getBuildStatus) — reads whichever action's result.data happens to carry this shape. */
function getLatestProjectStructure(task: ConversationTaskRecord): ProjectStructureResult | undefined {
  for (let i = task.actions.length - 1; i >= 0; i -= 1) {
    const action = task.actions[i];
    const data = action?.result?.data as Partial<ProjectStructureResult> | undefined;
    if (data && typeof data.workspaceName === 'string' && typeof data.dependencyCount === 'number') {
      return data as ProjectStructureResult;
    }
  }
  return undefined;
}

function isCodingTask(task: ConversationTaskRecord): boolean {
  return task.actions.some((a) => CODING_TASK_ACTION_TYPES.has(a.request.type));
}

/**
 * The universal visual execution surface for the whole Paw platform —
 * Desktop → Workspace Runtime → every individual runtime (Coding, File,
 * Browser, Communication, Office, Creative, Cloud, Learning, Family).
 * This component must stay runtime-agnostic: it only ever touches the
 * generic ConversationTaskRecord/ActionResult shapes every runtime
 * already produces through the Universal Execution Runtime — no
 * git/browser/build-plugin-specific knowledge, no per-runtime branching.
 *
 * Region layout: `goal` and `liveExecution` render real data (the latter
 * by embedding TaskCard as-is, which already renders Stages/Workflow/
 * BuildStatus/Errors/Recovery generically — fragmenting it into separate
 * regions now would just re-derive logic it already owns). `evidence`
 * (latest verify_rendered_ui result), `browserPreview` (latest real
 * screenshot bytes — an <img>, never an embedded <webview>: Electron has
 * no way to "dock" the real driven browser's webContents into a webview,
 * which would silently show a second, unverified browser instead of what
 * was actually checked), and `floatingSurface` (the currently in-flight
 * action's own path/narration — no new tracked type, derived from the
 * same data ConversationPanel already reads) all render real data too,
 * derived entirely from data every runtime already produces. `gitTimeline`
 * stays a reserved slot, out of scope for this pass.
 *
 * Coding Canvas (Phase 2): ten additional sections, appended only when
 * `isCodingTask(task)` — the engineering control center described in the
 * Coding Intelligence Runtime Phase 2 spec. Every section always renders,
 * with an honest placeholder when its real data isn't wired up yet (most
 * aren't, as of Phase 2.2 — later sub-phases fill them in via the same
 * shape-detection-off-action-results pattern `evidence`/`browserPreview`
 * already use, never a redesign of this shell). Execution-only sections
 * additionally read the current Paw Go/Pro mode so they can say "Paw Go is
 * planning & analysis only" instead of showing an empty section.
 */
export function WorkspaceRuntime({
  task,
  onRetryAction,
  onOpenPath,
}: {
  task: ConversationTaskRecord;
  onRetryAction?: (taskId: string, actionId: string) => void;
  onOpenPath?: (path: string, kind: 'file' | 'folder') => void;
}) {
  const codingTask = isCodingTask(task);
  const [codingMode, setCodingMode] = useState<'go' | 'pro' | null>(null);

  useEffect(() => {
    if (!codingTask) return;
    let cancelled = false;
    ipc.actionExecute({ type: 'getCodingMode' }).then((result) => {
      if (cancelled || !result.ok) return;
      const preferences = (result.data as { preferences?: { mode: 'go' | 'pro' } } | undefined)?.preferences;
      if (preferences) setCodingMode(preferences.mode);
    });
    return () => {
      cancelled = true;
    };
  }, [codingTask]);

  const proOnlyPlaceholder = (whenGo: string, whenProEmpty: string) =>
    codingMode === 'go' ? whenGo : whenProEmpty;

  const regions: WorkspaceRegionSlot[] = [
    {
      id: 'goal',
      render: () => (
        <div className={styles.goalHeader}>
          <span className={`${styles.statusDot} ${styles[`status_${task.status}`] ?? ''}`} />
          <span className={styles.goalText}>{task.goal}</span>
        </div>
      ),
    },
    {
      id: 'liveExecution',
      render: () => <TaskCard task={task} onRetryAction={onRetryAction} onOpenPath={onOpenPath} />,
    },
    {
      id: 'floatingSurface',
      render: () => {
        const inFlight = [...task.actions].reverse().find((a) => !a.result);
        if (!inFlight) return null;
        return (
          <div className={styles.currentFile}>
            <span className={styles.currentFileDot} />
            <span>{inFlight.inProgressText}</span>
          </div>
        );
      },
    },
    {
      id: 'browserPreview',
      render: () => {
        const screenshot = getLatestScreenshot(task);
        if (!screenshot) return null;
        return <img className={styles.previewImage} src={`data:image/png;base64,${screenshot}`} alt="Live preview of the current build" />;
      },
    },
    {
      id: 'evidence',
      render: () => {
        const evidence = getLatestVisualEvidence(task);
        if (!evidence) return null;
        return (
          <div className={styles.evidenceBlock}>
            <span className={`${styles.evidenceStatus} ${evidence.ok ? styles.evidenceOk : styles.evidenceIssues}`}>
              {evidence.ok ? '✓ Verified — no issues found' : `✗ ${evidence.issues.length} issue${evidence.issues.length === 1 ? '' : 's'} found`}
            </span>
            {evidence.issues.length > 0 && (
              <ul className={styles.evidenceIssueList}>
                {evidence.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        );
      },
    },
    { id: 'gitTimeline', render: null },
  ];

  if (codingTask) {
    regions.push(
      {
        id: 'projectUnderstanding',
        render: () => {
          const structure = getLatestProjectStructure(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Project Understanding</span>
              {structure ? (
                <div className={styles.codingSectionBody}>
                  <span>
                    {structure.workspaceName} — {structure.framework ? `${structure.framework}, ` : ''}
                    {structure.language}
                  </span>
                  <span className={styles.codingSectionEmpty}>
                    {structure.dependencyCount} dependenc{structure.dependencyCount === 1 ? 'y' : 'ies'}
                    {structure.devDependencyCount ? `, ${structure.devDependencyCount} dev-only` : ''}
                    {structure.entryPoint ? ` · entry point "${structure.entryPoint}"` : ''}
                  </span>
                </div>
              ) : (
                <span className={styles.codingSectionEmpty}>Analyzing project structure will appear here once available.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'todoProgress',
        render: () => {
          const progress = getLatestTodoProgress(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Live TODO Progress</span>
              {progress ? (
                <ul className={styles.todoList}>
                  {progress.items.map((item) => (
                    <li key={item.id} className={styles.todoItem}>
                      <span>{item.status === 'done' ? '✓' : item.status === 'inProgress' ? '▸' : item.status === 'skipped' ? '⊘' : '○'}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>No task checklist yet for this session.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'runningProcesses',
        render: () => {
          const processes = getLatestRunningProcesses(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Running Processes</span>
              {processes && processes.length > 0 ? (
                <ul className={styles.todoList}>
                  {processes.map((p) => (
                    <li key={p.id} className={styles.todoItem}>
                      <span>{p.status === 'running' ? '●' : p.status === 'starting' ? '◐' : '○'}</span>
                      <span>{p.command} — {p.status}{p.pid ? ` (pid ${p.pid})` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Paw Go is planning & analysis only — no processes run in this mode.', 'No processes running yet.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'terminalOutput',
        render: () => {
          const output = getLatestTerminalOutput(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Terminal Output</span>
              {output ? (
                <pre className={styles.terminalPreview}>{output.slice(-1200)}</pre>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Paw Go is planning & analysis only — no terminal output in this mode.', 'No commands run yet.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'codeDiff',
        render: () => {
          const stat = getLatestCodeDiffStat(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Live Code Diff</span>
              {stat && stat.filesChanged.length > 0 ? (
                <ul className={styles.todoList}>
                  {stat.filesChanged.map((f, i) => (
                    <li key={i} className={styles.todoItem}>
                      <span>{f.path}</span>
                      <span>(+{f.added}/-{f.deleted})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Paw Go is planning & analysis only — no file changes in this mode.', 'No changes made yet in this session.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'buildStatus',
        render: () => {
          const build = getLatestBuildStatus(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Build Status</span>
              {build ? (
                <div className={styles.codingSectionBody}>
                  <span className={styles.codingSectionEmpty}>
                    {build.status === 'success' ? '✓' : '✗'} {build.buildTool ?? 'Build'} — {build.status === 'success' ? 'succeeded' : 'failed'}
                    {build.durationMs !== undefined ? ` (${(build.durationMs / 1000).toFixed(1)}s)` : ''}
                  </span>
                  {build.failureDetail && <pre className={styles.terminalPreview}>{build.failureDetail.slice(-500)}</pre>}
                </div>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Paw Go is planning & analysis only — builds aren’t run in this mode.', 'Not built yet.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'testResults',
        render: () => {
          const results = getLatestTestResults(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Test Results</span>
              {results ? (
                <div className={styles.codingSectionBody}>
                  <span className={styles.codingSectionEmpty}>
                    {results.status === 'passed' ? '✓' : results.status === 'failed' ? '✗' : '?'}{' '}
                    {results.status === 'passed' ? 'Passed' : results.status === 'failed' ? 'Failed' : 'Unknown'}
                    {results.total !== undefined ? ` — ${results.passed ?? 0}/${results.total}` : ''}
                  </span>
                  {results.failureDetail && <pre className={styles.terminalPreview}>{results.failureDetail.slice(-500)}</pre>}
                </div>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Paw Go is planning & analysis only — tests aren’t run in this mode.', 'No tests run yet.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'browserConsole',
        render: () => {
          const entries = getLatestDevBrowserConsole(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Browser Console</span>
              {entries && entries.length > 0 ? (
                <ul className={styles.todoList}>
                  {entries.map((e, i) => (
                    <li key={i} className={styles.todoItem}>
                      <span>{e.level === 'error' ? '✗' : e.level === 'warning' ? '⚠' : '·'}</span>
                      <span>{e.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Browser console monitoring is a Paw Pro feature.', 'No browser session open yet.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'errorTimeline',
        render: () => {
          const errors = getErrorTimeline(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Error Timeline</span>
              {errors.length > 0 ? (
                <ul className={styles.todoList}>
                  {errors.map((e) => (
                    <li key={e.id} className={styles.todoItem}>
                      <span>✗</span>
                      <span>{e.actionType}: {e.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>
                  {proOnlyPlaceholder('Paw Go is planning & analysis only — no execution errors occur in this mode.', 'No errors recorded yet.')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'codingMemory',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Coding Memory</span>
            <span className={styles.codingSectionEmpty}>Ask me what I remember about this project once I've analyzed it.</span>
          </div>
        ),
      }
    );
  }

  return (
    <div className={styles.workspaceBorder}>
      <div className={styles.workspaceGrid}>
        {regions.map((region) =>
          region.render ? (
            <div key={region.id} className={styles[`region_${region.id}`] ?? styles.region}>
              {region.render()}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
