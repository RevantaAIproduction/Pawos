import React, { useMemo, useState } from 'react';
import styles from './taskCard.module.css';
import type { ConversationTaskAction, ConversationTaskRecord } from './ConversationTypes';
import type { ExecutionTrail, WorkflowMetadata, BuildStatus, VisualEvidence, TodoProgress, TestRunSummary, CodeDiffStat } from '../../shared/actions/ExecutionLifecycle';
import type { ManagedProcessInfo } from '../../shared/actions/ProcessTypes';
import type { DevBrowserConsoleEntry } from '../../shared/actions/DevBrowserTypes';

/**
 * The universal execution UI for Paw — one Task Card per user request
 * ("Install Java.") instead of one chat line per action, GitHub-Actions/
 * Cursor-style. The conversation only ever shows this card's summary;
 * expanding "View Details" reveals the developer trace (timeline, real
 * commands, output, files touched, env changes, verification, errors,
 * recovery, final report) built entirely from the same generic
 * ActionRequest/ActionResult data every plugin already returns — no
 * per-runtime special-casing, so Development/File/Browser/Office/etc. all
 * render through this one component automatically.
 */

const REQUEST_PATH_KEYS = ['path', 'to', 'entry', 'url', 'cwd'] as const;
const REQUEST_COMMAND_KEYS = ['command', 'buildCommand'] as const;

const FILE_WRITE_TYPES = new Set([
  'writeFile',
  'copyPath',
  'duplicatePath',
  'compressPath',
  'extractArchive',
  'mergeFolders',
  'splitFile',
  'printBrowserPageToPdf',
]);
const FILE_CREATE_TYPES = new Set(['createFolder']);
const FILE_CHANGE_TYPES = new Set(['movePath', 'deletePath', 'restorePath']);
const APP_OPEN_TYPES = new Set(['openApp']);
const ENV_CHANGE_TYPES = new Set(['setEnvironmentVariable', 'setPathEntry', 'writeEnvVar', 'setPreferredBrowserOrder']);
const VERIFY_TYPES = new Set(['verifyToolInstalled', 'checkProcessHealth', 'verifyDeployment', 'detectSoftware']);

/**
 * Universal stage buckets — the same five for every runtime (Development,
 * File, Browser, Office, Communication, Creative, Cloud, ...), never a
 * per-runtime label. Classified purely from generic action-type shape
 * (read-only vs. mutating vs. config vs. verify vs. cleanup) plus position
 * relative to the first mutating action — no runtime-specific knowledge
 * required, so a brand-new plugin type is classified correctly the moment
 * it's added, with zero changes here.
 */
const STAGE_ORDER = ['Preparation', 'Execution', 'Configuration', 'Verification', 'Cleanup'] as const;
type Stage = (typeof STAGE_ORDER)[number];

const CLEANUP_TYPES = new Set(['deletePath']);
/** Read-only/discovery action types — checked before CONFIG/VERIFY/CLEANUP so those stay in their own buckets even though some read data too. */
const READONLY_TYPES = new Set([
  'listDirectory', 'readFile', 'analyzeProject', 'gitStatus', 'gitDiff', 'gitLog', 'gitBranch', 'gitShow',
  'searchFiles', 'listWorkspaces', 'getWorkspace', 'readClipboard', 'listProcesses', 'getProcessOutput',
  'readBrowserConsole', 'readBrowserNetworkErrors', 'listBrowserTabs', 'readWebPage', 'extractPageData', 'readEnvVars',
  'listAvailableBrowsers', 'getBrowserHistory', 'listBookmarks', 'getBrowserCookies', 'bookmarkPage',
  'recordPageSummary', 'searchBrowserMemory', 'recordComparison', 'getComparison', 'checkpointResearch', 'getResearchStatus',
  // Memory Graph — read-only or internal-memory-only, never touches user
  // files, so these belong in Preparation like every other lookup.
  'indexWorkspace', 'recordTaskProvenance', 'findFileSemantic', 'getWorkspaceBundle', 'queryProvenance',
  'explainClassification', 'explainRelationship', 'findDuplicateFiles', 'analyzeFolder', 'getSpecialFolders',
]);

function classifyStage(action: ConversationTaskAction, index: number, actions: ConversationTaskAction[]): Stage {
  if (CLEANUP_TYPES.has(action.type)) return 'Cleanup';
  if (ENV_CHANGE_TYPES.has(action.type)) return 'Configuration';
  if (VERIFY_TYPES.has(action.type)) {
    // A verify-shaped action before any real work happens is a pre-check
    // ("is this already installed?") — Preparation. The same action type
    // after real work is a post-check confirming it worked — Verification.
    const firstWorkIndex = actions.findIndex(
      (a) => !READONLY_TYPES.has(a.type) && !VERIFY_TYPES.has(a.type) && !ENV_CHANGE_TYPES.has(a.type) && !CLEANUP_TYPES.has(a.type)
    );
    return firstWorkIndex === -1 || index < firstWorkIndex ? 'Preparation' : 'Verification';
  }
  if (READONLY_TYPES.has(action.type)) return 'Preparation';
  return 'Execution';
}

function groupByStage(actions: ConversationTaskAction[]): { stage: Stage; actions: ConversationTaskAction[] }[] {
  const buckets = new Map<Stage, ConversationTaskAction[]>();
  actions.forEach((action, i) => {
    const stage = classifyStage(action, i, actions);
    const bucket = buckets.get(stage);
    if (bucket) bucket.push(action);
    else buckets.set(stage, [action]);
  });
  return STAGE_ORDER.filter((stage) => buckets.has(stage)).map((stage) => ({ stage, actions: buckets.get(stage)! }));
}

function getField(request: unknown, keys: readonly string[]): string | undefined {
  const r = request as Record<string, unknown>;
  for (const key of keys) {
    if (typeof r[key] === 'string' && r[key]) return r[key] as string;
  }
  return undefined;
}

function getOutput(action: ConversationTaskAction): string | null {
  if (!action.result?.ok) return null;
  const data = action.result.data as Record<string, unknown> | undefined;
  if (data && typeof data.output === 'string' && data.output.trim()) return data.output.trim();
  return null;
}

/** Any real terminal output a task has produced so far — for the Coding Canvas `terminalOutput` region. */
export function getLatestTerminalOutput(task: ConversationTaskRecord): string | undefined {
  for (const action of [...task.actions].reverse()) {
    const output = getOutput(action);
    if (output) return output;
  }
  return undefined;
}

/** Shape-based — any plugin result carrying a real `processes: ManagedProcessInfo[]` snapshot (StartProcessPlugin/StopProcessPlugin/RestartProcessPlugin/ListProcessesPlugin), for the Coding Canvas `runningProcesses` region. */
export function getLatestRunningProcesses(task: ConversationTaskRecord): ManagedProcessInfo[] | undefined {
  for (const action of [...task.actions].reverse()) {
    const data = action.result?.data as { processes?: unknown } | undefined;
    if (Array.isArray(data?.processes) && data.processes.every((p): p is ManagedProcessInfo => Boolean(p) && typeof (p as ManagedProcessInfo).id === 'string')) {
      return data.processes as ManagedProcessInfo[];
    }
  }
  return undefined;
}

/** Shape-based, same precedent as getWorkflowMetadata/getBuildStatus — any plugin whose result.data has a real `testResults: {status,...}` shape gets a Test Results block (RunCommandPlugin attaches this when the command looks like a test runner). */
function getTestResults(action: ConversationTaskAction): TestRunSummary | undefined {
  const data = action.result?.data as { testResults?: Partial<TestRunSummary> } | undefined;
  const testResults = data?.testResults;
  if (!testResults || (testResults.status !== 'passed' && testResults.status !== 'failed' && testResults.status !== 'unknown')) return undefined;
  return {
    status: testResults.status,
    passed: typeof testResults.passed === 'number' ? testResults.passed : undefined,
    failed: typeof testResults.failed === 'number' ? testResults.failed : undefined,
    total: typeof testResults.total === 'number' ? testResults.total : undefined,
    failureDetail: typeof testResults.failureDetail === 'string' ? testResults.failureDetail : undefined,
  };
}

/** The most recent test run for a task, if any — for the Coding Canvas `testResults` region. */
export function getLatestTestResults(task: ConversationTaskRecord): TestRunSummary | undefined {
  for (const action of [...task.actions].reverse()) {
    const results = getTestResults(action);
    if (results) return results;
  }
  return undefined;
}

function getTrail(action: ConversationTaskAction): ExecutionTrail | undefined {
  return action.result?.trail;
}

/** Shape-based — any plugin whose result.data has a real `filesChanged: {path,added,deleted}[]` array (GitDiffStatPlugin), for the Coding Canvas `codeDiff` region. */
function getCodeDiffStat(action: ConversationTaskAction): CodeDiffStat | undefined {
  const data = action.result?.data as Partial<CodeDiffStat> | undefined;
  if (!data || !Array.isArray(data.filesChanged)) return undefined;
  return {
    filesChanged: data.filesChanged,
    totalAdded: typeof data.totalAdded === 'number' ? data.totalAdded : 0,
    totalDeleted: typeof data.totalDeleted === 'number' ? data.totalDeleted : 0,
  };
}

/** The most recent real diff stat for a task, if any — for the Coding Canvas `codeDiff` region. */
export function getLatestCodeDiffStat(task: ConversationTaskRecord): CodeDiffStat | undefined {
  for (const action of [...task.actions].reverse()) {
    const stat = getCodeDiffStat(action);
    if (stat) return stat;
  }
  return undefined;
}

export type ErrorTimelineEntry = { id: string; timestamp: number; actionType: string; message: string };

/**
 * Real failures from this task's own actions, chronologically — no new
 * store, no taskId plumbing: every ok:false result already IS a real,
 * timestamped error, exactly the same data `sections.errors` already
 * derives for the existing Errors section. For the Coding Canvas
 * `errorTimeline` region.
 */
export function getErrorTimeline(task: ConversationTaskRecord): ErrorTimelineEntry[] {
  return task.actions
    .filter((a) => a.result && !a.result.ok)
    .map((a) => ({
      id: a.id,
      timestamp: a.endedAt ?? a.startedAt,
      actionType: a.type,
      message: (a.result && !a.result.ok && a.result.message) || a.doneText || 'Failed.',
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Shape-based detection, not a hardcoded action-type list — any plugin
 * (Browser Runtime's Comparison Workflow today, a future higher-level
 * runtime's own composite workflow tomorrow) whose result.data carries
 * this shape gets a Workflow summary rendered automatically, with zero
 * changes needed here.
 */
function getWorkflowMetadata(action: ConversationTaskAction): WorkflowMetadata | undefined {
  const data = action.result?.data as Partial<WorkflowMetadata> | undefined;
  if (!data || typeof data.workflowName !== 'string' || !Array.isArray(data.plan)) return undefined;
  return {
    workflowName: data.workflowName,
    plan: data.plan.filter((step): step is string => typeof step === 'string'),
    candidatesProcessed: typeof data.candidatesProcessed === 'number' ? data.candidatesProcessed : 0,
    successfulSteps: typeof data.successfulSteps === 'number' ? data.successfulSteps : 0,
    failedSteps: typeof data.failedSteps === 'number' ? data.failedSteps : 0,
  };
}

/** Shape-based, same precedent as getWorkflowMetadata/getBuildStatus — any plugin whose result.data has a real `items: {id,label,status}[]` array gets a Live TODO Progress block. */
function getTodoProgress(action: ConversationTaskAction): TodoProgress | undefined {
  const data = action.result?.data as Partial<TodoProgress> | undefined;
  if (!data || !Array.isArray(data.items)) return undefined;
  const items = data.items.filter(
    (i): i is TodoProgress['items'][number] =>
      Boolean(i) && typeof i.id === 'string' && typeof i.label === 'string' && ['pending', 'inProgress', 'done', 'skipped'].includes(i.status)
  );
  if (items.length === 0) return undefined;
  return { items };
}

/** The most recent declared checklist for a task, if any — "latest call wins" precedent, for the Coding Canvas `todoProgress` region. */
export function getLatestTodoProgress(task: ConversationTaskRecord): TodoProgress | undefined {
  for (const action of [...task.actions].reverse()) {
    const progress = getTodoProgress(action);
    if (progress) return progress;
  }
  return undefined;
}

/** Shape-based, same precedent as getWorkflowMetadata — any plugin whose result.data has a real `status: 'success'|'failed'` gets a Build Status block, not just buildProject specifically. */
function getBuildStatus(action: ConversationTaskAction): BuildStatus | undefined {
  const data = action.result?.data as Partial<BuildStatus> | undefined;
  if (!data || (data.status !== 'success' && data.status !== 'failed')) return undefined;
  return {
    status: data.status,
    outputDir: typeof data.outputDir === 'string' ? data.outputDir : undefined,
    durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
    buildTool: typeof data.buildTool === 'string' ? data.buildTool : undefined,
    failureDetail: typeof data.failureDetail === 'string' ? data.failureDetail : undefined,
  };
}

/** The most recent real build outcome for a task, if any — for the Coding Canvas `buildStatus` region. */
export function getLatestBuildStatus(task: ConversationTaskRecord): BuildStatus | undefined {
  for (const action of [...task.actions].reverse()) {
    const build = getBuildStatus(action);
    if (build) return build;
  }
  return undefined;
}

/**
 * Shape-based, same precedent as getWorkflowMetadata/getBuildStatus —
 * any plugin whose result.data has a real {ok, issues, base64Png} shape
 * gets treated as visual evidence, not just verifyRenderedUi
 * specifically. Exported so WorkspaceRuntime's `evidence`/`browserPreview`
 * regions can find the latest real screenshot/verification for a task
 * without duplicating this detection logic.
 */
export function getVisualEvidence(action: ConversationTaskAction): VisualEvidence | undefined {
  const data = action.result?.data as Partial<VisualEvidence> | undefined;
  // Requires both fields (not just base64Png) so a plain screenshot capture
  // isn't mistaken for a completed verification pass — issues is only ever
  // present on a real verifyRenderedUi result.
  if (!data || typeof data.base64Png !== 'string' || !Array.isArray(data.issues)) return undefined;
  return {
    ok: Boolean(data.ok),
    issues: data.issues.filter((i): i is string => typeof i === 'string'),
    base64Png: data.base64Png,
  };
}

/** Any real screenshot bytes a task has produced so far (a plain capture or a verification pass) — for the browserPreview region, which only cares "what did the browser last actually look like," not whether it was a verification. */
export function getLatestScreenshot(task: ConversationTaskRecord): string | undefined {
  for (const action of [...task.actions].reverse()) {
    const data = action.result?.data as { base64Png?: string } | undefined;
    if (typeof data?.base64Png === 'string') return data.base64Png;
  }
  return undefined;
}

/** The most recent real verify_rendered_ui result for a task, if any — for the `evidence` region. */
export function getLatestVisualEvidence(task: ConversationTaskRecord): VisualEvidence | undefined {
  for (const action of [...task.actions].reverse()) {
    const evidence = getVisualEvidence(action);
    if (evidence) return evidence;
  }
  return undefined;
}

/** Shape-based — DevBrowserPreviewPlugin's real console log entries, for the Coding Canvas `browserConsole` region. */
export function getLatestDevBrowserConsole(task: ConversationTaskRecord): DevBrowserConsoleEntry[] | undefined {
  for (const action of [...task.actions].reverse()) {
    const data = action.result?.data as { consoleEntries?: unknown } | undefined;
    if (Array.isArray(data?.consoleEntries) && data.consoleEntries.every((e): e is DevBrowserConsoleEntry => Boolean(e) && typeof (e as DevBrowserConsoleEntry).text === 'string')) {
      return data.consoleEntries as DevBrowserConsoleEntry[];
    }
  }
  return undefined;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildLogText(task: ConversationTaskRecord): string {
  const lines: string[] = [
    `Task: ${task.goal}`,
    `Status: ${task.status}`,
    `Started: ${new Date(task.startedAt).toISOString()}`,
    task.endedAt ? `Ended: ${new Date(task.endedAt).toISOString()}` : 'Ended: (still running)',
    task.endedAt ? `Duration: ${formatDuration(task.endedAt - task.startedAt)}` : '',
    '',
  ];
  task.actions.forEach((action, i) => {
    lines.push(`[${i + 1}] ${action.type} — ${action.result ? (action.result.ok ? 'ok' : 'failed') : 'running'}`);
    const command = getField(action.request, REQUEST_COMMAND_KEYS);
    const path = getField(action.request, REQUEST_PATH_KEYS);
    if (command) lines.push(`    command: ${command}`);
    if (path) lines.push(`    path: ${path}`);
    if (action.doneText) lines.push(`    ${action.doneText}`);
    const output = getOutput(action);
    if (output) lines.push(`    output:\n${output.split('\n').map((l) => `      ${l}`).join('\n')}`);
    if (action.result && !action.result.ok) lines.push(`    error: ${action.result.message ?? action.result.reason}`);
    lines.push('');
  });
  if (task.finalReport) {
    lines.push('Final report:');
    lines.push(task.finalReport);
  }
  return lines.join('\n');
}

function statusMeta(status: ConversationTaskRecord['status']): { icon: string; label: string; className: string } {
  if (status === 'running') return { icon: '⚙️', label: 'Running', className: styles.statusRunning ?? '' };
  if (status === 'failed') return { icon: '✗', label: 'Failed', className: styles.statusFailed ?? '' };
  if (status === 'interrupted') return { icon: '⏸', label: 'Interrupted', className: styles.statusInterrupted ?? '' };
  return { icon: '✓', label: 'Completed', className: styles.statusCompleted ?? '' };
}

function ActionRow({
  action,
  index,
  onRetry,
}: {
  action: ConversationTaskAction;
  index: number;
  onRetry?: () => void;
}) {
  const failed = action.result && !action.result.ok;
  const running = !action.result;
  const icon = running ? '⚙️' : failed ? '✗' : '✓';
  return (
    <div className={styles.timelineRow}>
      <span className={`${styles.timelineIcon} ${failed ? styles.timelineIconFailed : running ? styles.timelineIconRunning : styles.timelineIconOk}`}>
        {icon}
      </span>
      <div className={styles.timelineBody}>
        <div className={styles.timelineHeader}>
          <span className={styles.timelineIndex}>{index + 1}.</span>
          <span className={styles.timelineType}>{action.type}</span>
          <span className={styles.timelineTime}>{formatTimestamp(action.startedAt)}</span>
          {action.endedAt && <span className={styles.timelineDuration}>{formatDuration(action.endedAt - action.startedAt)}</span>}
        </div>
        <div className={styles.timelineText}>{action.doneText ?? action.inProgressText}</div>
        {failed && onRetry && (
          <button type="button" className={styles.retryBtn} onClick={onRetry}>
            ↻ Retry this step
          </button>
        )}
      </div>
    </div>
  );
}

function StageGroup({
  stage,
  actions,
  collapsed,
  onToggle,
  onRetryAction,
  taskId,
}: {
  stage: Stage;
  actions: ConversationTaskAction[];
  collapsed: boolean;
  onToggle: () => void;
  onRetryAction?: (taskId: string, actionId: string) => void;
  taskId: string;
}) {
  const okCount = actions.filter((a) => a.result?.ok).length;
  const failCount = actions.filter((a) => a.result && !a.result.ok).length;
  return (
    <div className={styles.stageGroup}>
      <button type="button" className={styles.stageHeader} onClick={onToggle}>
        <span className={styles.stageChevron}>{collapsed ? '▸' : '▾'}</span>
        <span className={styles.stageTitle}>{stage}</span>
        <span className={styles.stageCounts}>
          {okCount > 0 && <span className={styles.verifyOk}>{okCount} ✓</span>}
          {failCount > 0 && <span className={styles.verifyFail}>{failCount} ✗</span>}
        </span>
      </button>
      {!collapsed && (
        <div className={styles.timeline}>
          {actions.map((action, i) => (
            <ActionRow
              key={action.id}
              action={action}
              index={i}
              onRetry={action.result && !action.result.ok && onRetryAction ? () => onRetryAction(taskId, action.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  onRetryAction,
  onOpenPath,
}: {
  task: ConversationTaskRecord;
  onRetryAction?: (taskId: string, actionId: string) => void;
  onOpenPath?: (path: string, kind: 'file' | 'folder') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState<Set<Stage>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());

  const toggleStage = (stage: Stage) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const toggleOutputExpanded = (actionId: string) => {
    setExpandedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  };

  const stageGroups = useMemo(() => groupByStage(task.actions), [task.actions]);

  const meta = statusMeta(task.status);
  const duration = task.endedAt ? task.endedAt - task.startedAt : Date.now() - task.startedAt;
  const errorCount = task.actions.filter((a) => a.result && !a.result.ok).length;
  const warningCount = task.actions.filter((a) => a.result?.ok && getTrail(a)?.recovered).length;

  const sections = useMemo(() => {
    const commands = task.actions.filter((a) => getField(a.request, REQUEST_COMMAND_KEYS));
    const filesCreated = task.actions.filter(
      (a) => (FILE_CREATE_TYPES.has(a.type) && a.result?.ok) || (FILE_WRITE_TYPES.has(a.type) && a.result?.ok && (a.result.data as { overwritten?: boolean } | undefined)?.overwritten === false)
    );
    const filesModified = task.actions.filter(
      (a) => (FILE_CHANGE_TYPES.has(a.type) && a.result?.ok) || (FILE_WRITE_TYPES.has(a.type) && a.result?.ok && (a.result.data as { overwritten?: boolean } | undefined)?.overwritten === true)
    );
    const appsOpened = task.actions.filter((a) => APP_OPEN_TYPES.has(a.type) && a.result?.ok);
    const envChanges = task.actions.filter((a) => ENV_CHANGE_TYPES.has(a.type));
    const verifications = task.actions.filter((a) => VERIFY_TYPES.has(a.type));
    const errors = task.actions.filter((a) => a.result && !a.result.ok);
    const recoveries = task.actions.filter((a) => (getTrail(a)?.attempts ?? 0) > 1);
    const workflows = task.actions.filter((a) => getWorkflowMetadata(a));
    const buildStatuses = task.actions.filter((a) => getBuildStatus(a));
    const testResultActions = task.actions.filter((a) => getTestResults(a));
    const codeDiffActions = task.actions.filter((a) => getCodeDiffStat(a));
    const todoProgress = getLatestTodoProgress(task);
    return { commands, filesCreated, filesModified, appsOpened, envChanges, verifications, errors, recoveries, workflows, buildStatuses, testResultActions, codeDiffActions, todoProgress };
  }, [task.actions]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(buildLogText(task)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleExport = () => {
    const blob = new Blob([buildLogText(task)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = task.goal.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'task';
    a.href = url;
    a.download = `${safeName}-${task.id.slice(0, 8)}.log.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.card}>
      <button type="button" className={styles.header} onClick={() => setExpanded((v) => !v)}>
        <span className={`${styles.statusBadge} ${meta.className}`}>
          {meta.icon} {meta.label}
        </span>
        <span className={styles.goal}>{task.goal}</span>
        <span className={styles.metaStats}>
          <span title="Duration">{formatDuration(duration)}</span>
          <span title="Actions completed">{task.actions.length} action{task.actions.length === 1 ? '' : 's'}</span>
          {warningCount > 0 && <span className={styles.warnBadge} title="Warnings">{warningCount} warning{warningCount === 1 ? '' : 's'}</span>}
          {errorCount > 0 && <span className={styles.errBadge} title="Errors">{errorCount} error{errorCount === 1 ? '' : 's'}</span>}
        </span>
        <span className={styles.chevron}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className={styles.details}>
          <div className={styles.toolbar}>
            <button type="button" className={styles.toolbarBtn} onClick={handleCopy}>
              {copied ? 'Copied ✓' : 'Copy logs'}
            </button>
            <button type="button" className={styles.toolbarBtn} onClick={handleExport}>
              Export logs
            </button>
            <span className={styles.toolbarTimestamps}>
              {formatTimestamp(task.startedAt)}
              {task.endedAt ? ` → ${formatTimestamp(task.endedAt)}` : ' → …'}
            </span>
          </div>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Stages</h4>
            {stageGroups.map(({ stage, actions }) => (
              <StageGroup
                key={stage}
                stage={stage}
                actions={actions}
                collapsed={collapsedStages.has(stage)}
                onToggle={() => toggleStage(stage)}
                onRetryAction={onRetryAction}
                taskId={task.id}
              />
            ))}
          </section>

          {sections.workflows.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>{sections.workflows.length === 1 ? 'Workflow' : 'Workflows'}</h4>
              {sections.workflows.map((a) => {
                const meta = getWorkflowMetadata(a);
                if (!meta) return null;
                const trail = getTrail(a);
                const duration = a.endedAt ? formatDuration(a.endedAt - a.startedAt) : 'running…';
                return (
                  <div key={a.id} className={styles.workflowBlock}>
                    <div className={styles.workflowName}>{meta.workflowName}</div>
                    <div className={styles.workflowGrid}>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatLabel}>Duration</span>
                        <span className={styles.workflowStatValue}>{duration}</span>
                      </div>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatLabel}>Candidates Processed</span>
                        <span className={styles.workflowStatValue}>{meta.candidatesProcessed}</span>
                      </div>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatLabel}>Successful Steps</span>
                        <span className={styles.workflowStatValue}>{meta.successfulSteps}</span>
                      </div>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatLabel}>Failed Steps</span>
                        <span className={styles.workflowStatValue}>{meta.failedSteps}</span>
                      </div>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatLabel}>Recovery Attempts</span>
                        <span className={styles.workflowStatValue}>{trail?.attempts ?? 0}</span>
                      </div>
                    </div>
                    {meta.plan.length > 0 && (
                      <div>
                        <span className={styles.workflowStatLabel}>Execution Plan</span>
                        <ol className={styles.planList}>
                          {meta.plan.map((step, i) => (
                            <li key={i} className={styles.planStep}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <div>
                      <span className={styles.workflowStatLabel}>Final Result</span>
                      <div className={styles.finalReport}>{a.doneText ?? (a.result?.ok ? 'Done.' : a.result?.message)}</div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {sections.buildStatuses.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Build Status</h4>
              {sections.buildStatuses.map((a) => {
                const build = getBuildStatus(a);
                if (!build) return null;
                return (
                  <div key={a.id} className={styles.workflowBlock}>
                    <div className={styles.workflowName}>
                      <span className={build.status === 'success' ? styles.verifyOk : styles.verifyFail}>{build.status === 'success' ? '✓' : '✗'}</span>{' '}
                      {build.buildTool ?? 'Build'} — {build.status === 'success' ? 'succeeded' : 'failed'}
                    </div>
                    <div className={styles.workflowGrid}>
                      {build.durationMs !== undefined && (
                        <div className={styles.workflowStat}>
                          <span className={styles.workflowStatLabel}>Duration</span>
                          <span className={styles.workflowStatValue}>{formatDuration(build.durationMs)}</span>
                        </div>
                      )}
                      {build.outputDir && (
                        <div className={styles.workflowStat}>
                          <span className={styles.workflowStatLabel}>Output Dir</span>
                          <span className={styles.workflowStatValue}>{build.outputDir}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {sections.testResultActions.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Test Results</h4>
              {sections.testResultActions.map((a) => {
                const results = getTestResults(a);
                if (!results) return null;
                return (
                  <div key={a.id} className={styles.workflowBlock}>
                    <div className={styles.workflowName}>
                      <span className={results.status === 'passed' ? styles.verifyOk : styles.verifyFail}>
                        {results.status === 'passed' ? '✓' : results.status === 'failed' ? '✗' : '?'}
                      </span>{' '}
                      {results.status === 'passed' ? 'Tests passed' : results.status === 'failed' ? 'Tests failed' : 'Test status unknown'}
                    </div>
                    {(results.passed !== undefined || results.failed !== undefined || results.total !== undefined) && (
                      <div className={styles.workflowGrid}>
                        {results.passed !== undefined && (
                          <div className={styles.workflowStat}>
                            <span className={styles.workflowStatLabel}>Passed</span>
                            <span className={styles.workflowStatValue}>{results.passed}</span>
                          </div>
                        )}
                        {results.failed !== undefined && (
                          <div className={styles.workflowStat}>
                            <span className={styles.workflowStatLabel}>Failed</span>
                            <span className={styles.workflowStatValue}>{results.failed}</span>
                          </div>
                        )}
                        {results.total !== undefined && (
                          <div className={styles.workflowStat}>
                            <span className={styles.workflowStatLabel}>Total</span>
                            <span className={styles.workflowStatValue}>{results.total}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {sections.codeDiffActions.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Live Code Diff</h4>
              {sections.codeDiffActions.map((a) => {
                const stat = getCodeDiffStat(a);
                if (!stat) return null;
                return (
                  <div key={a.id} className={styles.workflowBlock}>
                    <div className={styles.workflowName}>
                      {stat.filesChanged.length} file{stat.filesChanged.length === 1 ? '' : 's'} changed — +{stat.totalAdded}/-{stat.totalDeleted} lines
                    </div>
                    {stat.filesChanged.length > 0 && (
                      <ul className={styles.planList}>
                        {stat.filesChanged.map((f, i) => (
                          <li key={i}>
                            {f.path} (+{f.added}/-{f.deleted})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {sections.todoProgress && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Live TODO Progress</h4>
              <ul className={styles.planList}>
                {sections.todoProgress.items.map((item) => (
                  <li key={item.id}>
                    {item.status === 'done' ? '✓' : item.status === 'inProgress' ? '▸' : item.status === 'skipped' ? '⊘' : '○'} {item.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sections.commands.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Commands Executed</h4>
              {sections.commands.map((a) => (
                <pre key={a.id} className={styles.codeBlock}>{getField(a.request, REQUEST_COMMAND_KEYS)}</pre>
              ))}
            </section>
          )}

          {sections.commands.some((a) => getOutput(a)) && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Terminal Output</h4>
              {sections.commands.filter((a) => getOutput(a)).map((a) => {
                const isExpanded = expandedOutputs.has(a.id);
                return (
                  <div key={a.id} className={styles.terminalOutputBlock}>
                    <pre className={`${styles.codeBlock} ${isExpanded ? styles.codeBlockExpanded : ''}`}>{getOutput(a)}</pre>
                    <button type="button" className={styles.expandOutputBtn} onClick={() => toggleOutputExpanded(a.id)}>
                      {isExpanded ? '▴ Collapse' : '▾ Expand full output'}
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          {sections.filesCreated.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Files Created</h4>
              {sections.filesCreated.map((a) => {
                const path = getField(a.request, REQUEST_PATH_KEYS);
                return (
                  <div key={a.id} className={styles.fileRow}>
                    <span className={styles.filePath}>{path}</span>
                    {path && onOpenPath && (
                      <button type="button" className={styles.openBtn} onClick={() => onOpenPath(path, FILE_CREATE_TYPES.has(a.type) ? 'folder' : 'file')}>
                        Open
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {sections.filesModified.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Files Modified</h4>
              {sections.filesModified.map((a) => {
                const path = getField(a.request, REQUEST_PATH_KEYS);
                return (
                  <div key={a.id} className={styles.fileRow}>
                    <span className={styles.filePath}>{path}</span>
                    {path && onOpenPath && (
                      <button type="button" className={styles.openBtn} onClick={() => onOpenPath(path, 'file')}>
                        Open
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {sections.envChanges.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Environment Changes</h4>
              {sections.envChanges.map((a) => (
                <div key={a.id} className={styles.fileRow}>
                  <span className={styles.filePath}>{a.doneText ?? a.inProgressText}</span>
                </div>
              ))}
            </section>
          )}

          {sections.appsOpened.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Applications Opened</h4>
              {sections.appsOpened.map((a) => (
                <div key={a.id} className={styles.fileRow}>
                  <span className={styles.filePath}>{a.doneText ?? a.inProgressText}</span>
                </div>
              ))}
            </section>
          )}

          {sections.verifications.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Verification Results</h4>
              {sections.verifications.map((a) => (
                <div key={a.id} className={styles.fileRow}>
                  <span className={a.result?.ok ? styles.verifyOk : styles.verifyFail}>{a.result?.ok ? '✓' : '✗'}</span>
                  <span className={styles.filePath}>{a.doneText ?? a.inProgressText}</span>
                </div>
              ))}
            </section>
          )}

          {sections.errors.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Errors</h4>
              {sections.errors.map((a) => (
                <div key={a.id} className={styles.errorRow}>
                  <div>{a.doneText ?? (a.result && !a.result.ok ? a.result.message : '')}</div>
                  {onRetryAction && (
                    <button type="button" className={styles.retryBtn} onClick={() => onRetryAction(task.id, a.id)}>
                      ↻ Retry
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          {sections.recoveries.length > 0 && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Recovery Attempts</h4>
              {sections.recoveries.map((a) => {
                const trail = getTrail(a);
                return (
                  <div key={a.id} className={styles.fileRow}>
                    <span className={styles.filePath}>
                      {a.type}: {trail?.attempts} attempt{trail?.attempts === 1 ? '' : 's'}{trail?.recovered ? ' — recovered' : ' — not recovered'}
                    </span>
                  </div>
                );
              })}
            </section>
          )}

          {task.finalReport && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Final Report</h4>
              <div className={styles.finalReport}>{task.finalReport}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
