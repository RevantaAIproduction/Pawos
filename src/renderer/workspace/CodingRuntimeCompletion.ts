import type { CodeDiffStat } from '../../shared/actions/ExecutionLifecycle';
import { classifyCodingRequest, type CodingRequestClassification } from '../../shared/actions/RequestClassification';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { ConversationTaskAction, ConversationTaskRecord } from '../conversation/ConversationTypes';
import {
  getErrorTimeline,
  getLatestBuildStatus,
  getLatestCodeDiffStat,
  getLatestTestResults,
  getLatestVisualEvidence,
} from '../conversation/TaskCard';
import { evaluateCodingCompletionReadiness, type TaskCompletionReadiness } from '../conversation/LaunchReadinessUX';

const COMMAND_KEYS = ['command', 'buildCommand'] as const;
const PATH_KEYS = ['path', 'filePath', 'folderPath', 'targetPath', 'outputPath'] as const;
const FILE_CREATE_TYPES = new Set(['createFolder']);
const FILE_WRITE_TYPES = new Set(['writeFile']);
const FILE_CHANGE_TYPES = new Set(['writeFile', 'applyCodeEdit', 'gitAdd', 'gitCommit', 'gitCreateBranch', 'gitCheckout']);
const EXECUTION_ACTION_TYPES = new Set<ActionRequest['type']>([
  'writeFile',
  'runCommand',
  'startProcess',
  'stopProcess',
  'restartProcess',
  'gitAdd',
  'gitCommit',
  'gitCreateBranch',
  'gitCheckout',
  'buildProject',
  'applyCodeEdit',
  'runValidationPipeline',
  'devBrowserPreview',
  'captureBrowserScreenshot',
]);

export type CodingRuntimeCommandSummary = {
  id: string;
  command: string;
  cwd?: string;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
  durationMs?: number;
  output?: string;
};

export type CodingRuntimeUsageSummary = {
  taskUsedUnits?: number;
  sessionUsedUnits?: number;
  remainingUnits?: number | null;
  source: 'action-result' | 'not-emitted';
};

export type CodingRuntimeCompletionSummary = {
  classification: CodingRequestClassification;
  commands: CodingRuntimeCommandSummary[];
  createdFiles: string[];
  modifiedFiles: string[];
  diff?: CodeDiffStat;
  usage: CodingRuntimeUsageSummary;
  readiness: TaskCompletionReadiness;
};

function field(request: ActionRequest, keys: readonly string[]): string | undefined {
  const r = request as Record<string, unknown>;
  for (const key of keys) {
    if (typeof r[key] === 'string' && r[key]) return r[key] as string;
  }
  return undefined;
}

function output(action: ConversationTaskAction): string | undefined {
  const data = action.result?.data as { output?: unknown } | undefined;
  return typeof data?.output === 'string' && data.output.trim() ? data.output.trim() : undefined;
}

function numeric(data: Record<string, unknown> | undefined, keys: readonly string[]): number | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    if (typeof data[key] === 'number' && Number.isFinite(data[key])) return data[key] as number;
  }
  return undefined;
}

function nullableNumeric(data: Record<string, unknown> | undefined, keys: readonly string[]): number | null | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    if (data[key] === null) return null;
    if (typeof data[key] === 'number' && Number.isFinite(data[key])) return data[key] as number;
  }
  return undefined;
}

function usageFromAction(action: ConversationTaskAction): CodingRuntimeUsageSummary | undefined {
  const data = action.result?.data as Record<string, unknown> | undefined;
  const nested = data?.usage && typeof data.usage === 'object' ? (data.usage as Record<string, unknown>) : undefined;
  const source = nested ?? data;
  const taskUsedUnits = numeric(source, ['taskUsedUnits', 'usedUnits', 'computeUnits', 'consumedUnits']);
  const sessionUsedUnits = numeric(source, ['sessionUsedUnits', 'periodUsedUnits']);
  const remainingUnits = nullableNumeric(source, ['remainingUnits', 'periodRemainingUnits']);
  if (taskUsedUnits === undefined && sessionUsedUnits === undefined && remainingUnits === undefined) return undefined;
  return { taskUsedUnits, sessionUsedUnits, remainingUnits, source: 'action-result' };
}

function unique(values: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function getCodingRuntimeCommandSummaries(task: ConversationTaskRecord): CodingRuntimeCommandSummary[] {
  const summaries: CodingRuntimeCommandSummary[] = [];
  for (const action of task.actions) {
    const command = field(action.request, COMMAND_KEYS);
    if (!command) continue;
    const resultData = action.result?.data as { code?: unknown; exitCode?: unknown } | undefined;
    const exitCode =
      typeof resultData?.exitCode === 'number' ? resultData.exitCode : typeof resultData?.code === 'number' ? resultData.code : action.result?.ok ? 0 : undefined;
    summaries.push({
      id: action.id,
      command,
      cwd: field(action.request, ['cwd']),
      status: action.result ? (action.result.ok ? 'completed' : 'failed') : 'running',
      exitCode,
      durationMs: action.endedAt ? action.endedAt - action.startedAt : undefined,
      output: output(action) ?? (!action.result?.ok ? action.result?.message : undefined),
    });
  }
  return summaries;
}

export function summarizeCodingRuntimeTask(task: ConversationTaskRecord): CodingRuntimeCompletionSummary {
  const commands = getCodingRuntimeCommandSummaries(task);
  const createdFiles = unique(
    task.actions
      .filter(
        (a) => (FILE_CREATE_TYPES.has(a.type) && a.result?.ok) || (FILE_WRITE_TYPES.has(a.type) && a.result?.ok && (a.result.data as { overwritten?: boolean } | undefined)?.overwritten === false)
      )
      .map((a) => field(a.request, PATH_KEYS))
  );
  const modifiedFiles = unique(
    task.actions
      .filter(
        (a) => (FILE_CHANGE_TYPES.has(a.type) && a.result?.ok) || (FILE_WRITE_TYPES.has(a.type) && a.result?.ok && (a.result.data as { overwritten?: boolean } | undefined)?.overwritten === true)
      )
      .map((a) => field(a.request, PATH_KEYS))
  );
  const build = getLatestBuildStatus(task);
  const tests = getLatestTestResults(task);
  const visual = getLatestVisualEvidence(task);
  const classification = task.actions.some((a) => EXECUTION_ACTION_TYPES.has(a.request.type)) ? 'EXECUTE' : classifyCodingRequest(task.goal);
  const readiness = evaluateCodingCompletionReadiness({
    classification,
    hasFileActivity: createdFiles.length > 0 || modifiedFiles.length > 0,
    hasCommandActivity: commands.length > 0,
    hasBuildResult: Boolean(build),
    buildPassed: build?.status === 'success',
    hasTestResult: Boolean(tests),
    testsPassed: tests?.status === 'passed',
    hasVisualVerification: Boolean(visual),
    visualVerificationPassed: visual?.ok,
    hasFailures: getErrorTimeline(task).length > 0,
  });
  const usage = [...task.actions].reverse().map(usageFromAction).find(Boolean) ?? { source: 'not-emitted' as const };
  return {
    classification,
    commands,
    createdFiles,
    modifiedFiles,
    diff: getLatestCodeDiffStat(task),
    usage,
    readiness,
  };
}
