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

/**
 * Action types that mark a task as an Infrastructure Runtime task — same
 * shape-based detection discipline as CODING_TASK_ACTION_TYPES above.
 */
const INFRA_TASK_ACTION_TYPES = new Set<ActionRequest['type']>([
  'deployProject',
  'rollbackDeployment',
  'promoteDeployment',
  'getDeploymentStatus',
  'listConfiguredInfraConnectors',
  'investigateTicket',
  'getApprovalQueue',
  'getInfraMode',
  'setInfraMode',
  'listEngineeringMemory',
  'getInfrastructureGraphSummary',
  'investigateProductionIssue',
  'compareDeployments',
  'discoverInfrastructure',
  'searchInfrastructure',
]);

function isInfraTask(task: ConversationTaskRecord): boolean {
  return task.actions.some((a) => INFRA_TASK_ACTION_TYPES.has(a.request.type));
}

/**
 * Action types that mark a task as an Office Intelligence Runtime task —
 * same shape-based detection discipline as CODING/INFRA_TASK_ACTION_TYPES
 * above. Deliberately excludes `openMailComposeWindow`/`confirmEmailSent`
 * since those are shared with the Communication Intelligence Runtime —
 * including them here would make ordinary meeting-followup tasks show the
 * Office Canvas too. The Office Email region still reads a compose action
 * from within an already-detected office task's own action list.
 */
const OFFICE_TASK_ACTION_TYPES = new Set<ActionRequest['type']>([
  'mergePdfs',
  'createDocx',
  'createSpreadsheet',
  'analyzeSpreadsheet',
  'createPresentation',
  'listRecentOfficeFiles',
  'confirmGeneralEmailSent',
]);

function isOfficeTask(task: ConversationTaskRecord): boolean {
  return task.actions.some((a) => OFFICE_TASK_ACTION_TYPES.has(a.request.type));
}

type OfficeDocumentShape = { outputPath: string; kind: 'document' | 'spreadsheet' | 'presentation'; detail: string };
function getOfficeDocumentsCreated(task: ConversationTaskRecord): OfficeDocumentShape[] {
  const out: OfficeDocumentShape[] = [];
  for (const action of task.actions) {
    if (!action.result?.ok) continue;
    const data = action.result.data as Record<string, unknown> | undefined;
    if (!data || typeof data.outputPath !== 'string') continue;
    if (action.request.type === 'mergePdfs') {
      out.push({ outputPath: data.outputPath, kind: 'document', detail: `${data.totalPages ?? '?'} pages merged from ${data.sourceCount ?? '?'} PDFs` });
    } else if (action.request.type === 'createDocx') {
      out.push({ outputPath: data.outputPath, kind: 'document', detail: 'Document' });
    } else if (action.request.type === 'createSpreadsheet') {
      out.push({ outputPath: data.outputPath, kind: 'spreadsheet', detail: `${data.sheetCount ?? '?'} sheet(s)` });
    } else if (action.request.type === 'createPresentation') {
      out.push({ outputPath: data.outputPath, kind: 'presentation', detail: `${data.slideCount ?? '?'} slide(s)` });
    }
  }
  return out.reverse();
}

type OfficeEmailShape = { recipient: string; subject: string; confirmed: boolean };
function getLatestOfficeEmail(task: ConversationTaskRecord): OfficeEmailShape | undefined {
  for (let i = task.actions.length - 1; i >= 0; i -= 1) {
    const action = task.actions[i];
    if (!action) continue;
    if (action.request.type === 'confirmGeneralEmailSent' && action.result?.ok) {
      const data = action.result.data as { recipient: string; subject: string };
      return { recipient: data.recipient, subject: data.subject, confirmed: true };
    }
    if (action.request.type === 'openMailComposeWindow') {
      return { recipient: action.request.recipient, subject: action.request.subject, confirmed: false };
    }
  }
  return undefined;
}

type DeployResultShape = { serviceName: string; provider: string; deploymentUrl: string; deploymentId: string };
function getLatestDeployResult(task: ConversationTaskRecord): DeployResultShape | undefined {
  for (let i = task.actions.length - 1; i >= 0; i -= 1) {
    const data = task.actions[i]?.result?.data as Partial<DeployResultShape> | undefined;
    if (data && typeof data.serviceName === 'string' && typeof data.deploymentUrl === 'string' && typeof data.provider === 'string') {
      return data as DeployResultShape;
    }
  }
  return undefined;
}

type DeploymentStatusShape = { source: string; status: string; url?: string };
function getLatestDeploymentStatus(task: ConversationTaskRecord): DeploymentStatusShape | undefined {
  for (let i = task.actions.length - 1; i >= 0; i -= 1) {
    const data = task.actions[i]?.result?.data as Partial<DeploymentStatusShape> | undefined;
    if (data && typeof data.source === 'string' && typeof data.status === 'string') return data as DeploymentStatusShape;
  }
  return undefined;
}

type EngineeringReportShape = {
  issueSummary: string;
  rootCause: string;
  evidence: string[];
  affectedServices: string[];
  affectedFiles: string[];
  riskAssessment: string;
  deploymentRecommendation: string;
  rollbackPlan: string;
};
/** Covers both investigateTicket (has `.ticket`) and investigateProductionIssue (has `.description`) — same real evidence shape either way, from investigationCore.ts. */
type TicketInvestigationShape = {
  ticket?: { id: string; title: string; status?: string };
  description?: string;
  matchedService?: string;
  findings: string[];
  healthCheck?: { url: string; ok: boolean };
  browserInspection?: { consoleErrors: string[]; networkFailures: string[] };
  relatedHistory?: { summary: string; at: number }[];
  engineeringReport?: EngineeringReportShape;
};
function getLatestTicketInvestigation(task: ConversationTaskRecord): TicketInvestigationShape | undefined {
  for (let i = task.actions.length - 1; i >= 0; i -= 1) {
    const data = task.actions[i]?.result?.data as Partial<TicketInvestigationShape> | undefined;
    if (data && (data.ticket || typeof data.description === 'string') && Array.isArray(data.findings)) return data as TicketInvestigationShape;
  }
  return undefined;
}

type DeploymentComparisonShape = {
  serviceName: string;
  current: { summary: string } | null;
  previous: { summary: string } | null;
  differences: string[];
};
function getLatestDeploymentComparison(task: ConversationTaskRecord): DeploymentComparisonShape | undefined {
  for (let i = task.actions.length - 1; i >= 0; i -= 1) {
    const data = task.actions[i]?.result?.data as Partial<DeploymentComparisonShape> | undefined;
    if (data && typeof data.serviceName === 'string' && Array.isArray(data.differences)) return data as DeploymentComparisonShape;
  }
  return undefined;
}

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

  const infraTask = isInfraTask(task);
  const ticketInvestigation = infraTask ? getLatestTicketInvestigation(task) : undefined;
  const deployResult = infraTask ? getLatestDeployResult(task) : undefined;
  const infraServiceName = ticketInvestigation?.matchedService ?? deployResult?.serviceName;

  const [infraConnectors, setInfraConnectors] = useState<{ kind: string; displayName: string; configured: boolean }[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<{ id: string; summary: string }[]>([]);
  const [engineeringMemory, setEngineeringMemory] = useState<{ kind: string; summary: string; at: number; status: string }[]>([]);
  const [infraGraph, setInfraGraph] = useState<{ direction: string; relation: string; otherType: string; otherLabel: string }[] | null>(null);

  useEffect(() => {
    if (!infraTask) return;
    let cancelled = false;
    ipc.actionExecute({ type: 'listConfiguredInfraConnectors' }).then((result) => {
      if (cancelled || !result.ok) return;
      const data = result.data as { connectors: typeof infraConnectors; cliTools: typeof infraConnectors };
      setInfraConnectors([...data.connectors, ...data.cliTools]);
    });
    ipc.actionExecute({ type: 'getApprovalQueue' }).then((result) => {
      if (cancelled || !result.ok) return;
      setApprovalQueue((result.data as { pending: typeof approvalQueue }).pending);
    });
    ipc.actionExecute({ type: 'listEngineeringMemory' }).then((result) => {
      if (cancelled || !result.ok) return;
      setEngineeringMemory((result.data as { entries: typeof engineeringMemory }).entries);
    });
    return () => {
      cancelled = true;
    };
  }, [infraTask, task.actions.length]);

  useEffect(() => {
    if (!infraServiceName) return;
    let cancelled = false;
    ipc.actionExecute({ type: 'getInfrastructureGraphSummary', serviceName: infraServiceName }).then((result) => {
      if (cancelled) return;
      setInfraGraph(result.ok ? (result.data as { edges: typeof infraGraph }).edges ?? [] : []);
    });
    return () => {
      cancelled = true;
    };
  }, [infraServiceName]);

  const officeTask = isOfficeTask(task);
  const officeDocuments = officeTask ? getOfficeDocumentsCreated(task) : [];
  const officeEmail = officeTask ? getLatestOfficeEmail(task) : undefined;
  const [recentOfficeFiles, setRecentOfficeFiles] = useState<{ type: string; attributes: Record<string, unknown>; updatedAt: number }[]>([]);

  useEffect(() => {
    if (!officeTask) return;
    let cancelled = false;
    ipc.actionExecute({ type: 'listRecentOfficeFiles' }).then((result) => {
      if (cancelled || !result.ok) return;
      setRecentOfficeFiles((result.data as { files: typeof recentOfficeFiles }).files);
    });
    return () => {
      cancelled = true;
    };
  }, [officeTask, task.actions.length]);

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

  if (infraTask) {
    regions.push(
      {
        id: 'infrastructureOverview',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Infrastructure Overview</span>
            {deployResult ? (
              <span className={styles.codingSectionEmpty}>
                {deployResult.serviceName} — deployed via {deployResult.provider} · {deployResult.deploymentUrl}
              </span>
            ) : ticketInvestigation?.matchedService ? (
              <span className={styles.codingSectionEmpty}>Matched service: {ticketInvestigation.matchedService}</span>
            ) : (
              <span className={styles.codingSectionEmpty}>No service matched yet in this session.</span>
            )}
          </div>
        ),
      },
      {
        id: 'connectedProviders',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Connected Providers</span>
            {infraConnectors.length > 0 ? (
              <ul className={styles.todoList}>
                {infraConnectors.map((c, i) => (
                  <li key={i} className={styles.todoItem}>
                    <span>{c.configured ? '●' : '○'}</span>
                    <span>{c.displayName}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>Checking connectors…</span>
            )}
          </div>
        ),
      },
      {
        id: 'activeDeployments',
        render: () => {
          const active = engineeringMemory.filter((e) => e.kind === 'deployment' && e.status === 'success').slice(0, 5);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Active Deployments</span>
              {active.length > 0 ? (
                <ul className={styles.todoList}>
                  {active.map((e, i) => (
                    <li key={i} className={styles.todoItem}>
                      <span>●</span>
                      <span>{e.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>No deployments recorded yet.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'liveDeploymentStatus',
        render: () => {
          const status = getLatestDeploymentStatus(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Live Deployment Status</span>
              {status ? (
                <span className={styles.codingSectionEmpty}>
                  {status.status} (via {status.source}){status.url ? ` — ${status.url}` : ''}
                </span>
              ) : (
                <span className={styles.codingSectionEmpty}>Ask me to check deployment status to see it here.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'ticketInvestigation',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Live Investigation</span>
            {ticketInvestigation ? (
              <div className={styles.codingSectionBody}>
                <span className={styles.codingSectionEmpty}>
                  {ticketInvestigation.ticket ? `${ticketInvestigation.ticket.id}: ${ticketInvestigation.ticket.title}` : ticketInvestigation.description}
                </span>
                <ul className={styles.todoList}>
                  {ticketInvestigation.findings.map((f, i) => (
                    <li key={i} className={styles.todoItem}>
                      <span>·</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span className={styles.codingSectionEmpty}>Nothing investigated yet in this session.</span>
            )}
          </div>
        ),
      },
      {
        id: 'engineeringReports',
        render: () => {
          const report = ticketInvestigation?.engineeringReport;
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Engineering Reports</span>
              {report ? (
                <div className={styles.codingSectionBody}>
                  <span className={styles.codingSectionEmpty}>{report.issueSummary}</span>
                  <ul className={styles.todoList}>
                    <li className={styles.todoItem}>
                      <span>◆</span>
                      <span>Root cause: {report.rootCause}</span>
                    </li>
                    <li className={styles.todoItem}>
                      <span>◆</span>
                      <span>Risk: {report.riskAssessment}</span>
                    </li>
                    <li className={styles.todoItem}>
                      <span>◆</span>
                      <span>Recommendation: {report.deploymentRecommendation}</span>
                    </li>
                    <li className={styles.todoItem}>
                      <span>◆</span>
                      <span>Rollback plan: {report.rollbackPlan}</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <span className={styles.codingSectionEmpty}>No engineering report generated yet in this session.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'infrastructureGraph',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Infrastructure Graph</span>
            {infraGraph && infraGraph.length > 0 ? (
              <ul className={styles.todoList}>
                {infraGraph.map((e, i) => (
                  <li key={i} className={styles.todoItem}>
                    <span>{e.direction === 'outgoing' ? '→' : '←'}</span>
                    <span>{e.relation} {e.otherType} "{e.otherLabel}"</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>
                {infraServiceName ? 'No recorded relationships for this service yet.' : 'No service matched yet to map relationships for.'}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'engineeringMemory',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Engineering Memory</span>
            {engineeringMemory.length > 0 ? (
              <ul className={styles.todoList}>
                {engineeringMemory.slice(0, 8).map((e, i) => (
                  <li key={i} className={styles.todoItem}>
                    <span>{e.status === 'success' ? '✓' : e.status === 'failure' ? '✗' : '○'}</span>
                    <span>{e.summary}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>Ask me what I remember about your infrastructure once something's been deployed or investigated.</span>
            )}
          </div>
        ),
      },
      {
        id: 'approvalQueue',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Approval Queue</span>
            {approvalQueue.length > 0 ? (
              <ul className={styles.todoList}>
                {approvalQueue.map((a) => (
                  <li key={a.id} className={styles.todoItem}>
                    <span>⏳</span>
                    <span>{a.summary}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>Nothing is waiting on your approval.</span>
            )}
          </div>
        ),
      },
      {
        id: 'rollbackHistory',
        render: () => {
          const rollbacks = engineeringMemory.filter((e) => e.kind === 'rollback').slice(0, 5);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Rollback History</span>
              {rollbacks.length > 0 ? (
                <ul className={styles.todoList}>
                  {rollbacks.map((e, i) => (
                    <li key={i} className={styles.todoItem}>
                      <span>{e.status === 'success' ? '✓' : '✗'}</span>
                      <span>{e.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>No rollbacks recorded yet.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'deploymentHistory',
        render: () => {
          const deployments = engineeringMemory.filter((e) => e.kind === 'deployment').slice(0, 8);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Deployment History</span>
              {deployments.length > 0 ? (
                <ul className={styles.todoList}>
                  {deployments.map((e, i) => (
                    <li key={i} className={styles.todoItem}>
                      <span>{e.status === 'success' ? '✓' : '✗'}</span>
                      <span>{e.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className={styles.codingSectionEmpty}>No deployments recorded yet.</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'deploymentComparison',
        render: () => {
          const comparison = getLatestDeploymentComparison(task);
          return (
            <div className={styles.codingSection}>
              <span className={styles.codingSectionTitle}>Deployment Comparison</span>
              {comparison ? (
                <div className={styles.codingSectionBody}>
                  <span className={styles.codingSectionEmpty}>
                    {comparison.current?.summary ?? 'unknown'} vs. {comparison.previous?.summary ?? 'unknown'}
                  </span>
                  <ul className={styles.todoList}>
                    {comparison.differences.map((d, i) => (
                      <li key={i} className={styles.todoItem}>
                        <span>·</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <span className={styles.codingSectionEmpty}>Ask me to compare deployments for a service to see it here.</span>
              )}
            </div>
          );
        },
      }
    );
  }

  if (officeTask) {
    regions.push(
      {
        id: 'officeDocuments',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Documents</span>
            {officeDocuments.length > 0 ? (
              <ul className={styles.todoList}>
                {officeDocuments.map((d, i) => (
                  <li key={i} className={styles.todoItem}>
                    <span>{d.kind === 'presentation' ? '▤' : d.kind === 'spreadsheet' ? '▦' : '▥'}</span>
                    <span>{d.outputPath.split(/[/\\]/).pop()} — {d.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>No documents, spreadsheets, or presentations created yet in this session.</span>
            )}
          </div>
        ),
      },
      {
        id: 'officeEmail',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Email</span>
            {officeEmail ? (
              <span className={styles.codingSectionEmpty}>
                {officeEmail.confirmed ? 'Sent' : 'Drafted'} "{officeEmail.subject}" to {officeEmail.recipient}
                {!officeEmail.confirmed ? ' — waiting on you to send it and confirm.' : ''}
              </span>
            ) : (
              <span className={styles.codingSectionEmpty}>No email drafted yet in this session.</span>
            )}
          </div>
        ),
      },
      {
        id: 'officeTasks',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Tasks</span>
            <span className={styles.codingSectionEmpty}>Office task tracking isn't built yet — ask me about a specific document or email instead.</span>
          </div>
        ),
      },
      {
        id: 'officeSearch',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Office Search</span>
            <span className={styles.codingSectionEmpty}>Ask me to find a document, spreadsheet, or presentation — search runs through natural conversation, no separate search box yet.</span>
          </div>
        ),
      },
      {
        id: 'officeMemory',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Office Memory</span>
            <span className={styles.codingSectionEmpty}>Ask me what I remember about a document, spreadsheet, or presentation once you've created one.</span>
          </div>
        ),
      },
      {
        id: 'officeTimeline',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Office Timeline</span>
            {recentOfficeFiles.length > 0 ? (
              <ul className={styles.todoList}>
                {recentOfficeFiles.map((f, i) => (
                  <li key={i} className={styles.todoItem}>
                    <span>{new Date(f.updatedAt).toLocaleString()}</span>
                    <span>{f.type} — {String((f.attributes as { path?: string }).path ?? '').split(/[/\\]/).pop()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>No office activity recorded yet.</span>
            )}
          </div>
        ),
      },
      {
        id: 'recentOfficeFiles',
        render: () => (
          <div className={styles.codingSection}>
            <span className={styles.codingSectionTitle}>Recent Documents</span>
            {recentOfficeFiles.length > 0 ? (
              <ul className={styles.todoList}>
                {recentOfficeFiles.slice(0, 8).map((f, i) => (
                  <li key={i} className={styles.todoItem}>
                    <span>{f.type === 'presentation' ? '▤' : f.type === 'spreadsheet' ? '▦' : '▥'}</span>
                    <span>{String((f.attributes as { path?: string }).path ?? '').split(/[/\\]/).pop()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={styles.codingSectionEmpty}>No recent office files.</span>
            )}
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
