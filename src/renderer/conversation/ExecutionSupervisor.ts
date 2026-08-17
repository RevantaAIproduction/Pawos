import { v4 as uuidv4 } from 'uuid';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type {
  ExecutionCommandEvidence,
  ExecutionDiffEvidence,
  ExecutionFileEvidence,
  ExecutionRecord,
  ExecutionVerificationEvidence,
} from '../../shared/actions/ExecutionRecordTypes';
import type { CodeDiffStat, ExecutionTrail, TestRunSummary, VisualEvidence } from '../../shared/actions/ExecutionLifecycle';
import { ExecutionQueue } from './ExecutionQueue';

const AI_WORKER_PREFIXES = ['claude', 'codex', 'gemini', 'ollama'];

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

const SECRET_PATTERN = /(token|secret|password|api[_-]?key|oauth|credential|database_url|connection|string)/i;
const OUTPUT_LIMIT = 8_000;

function redactSecretText(value: string): string {
  if (!value) return value;
  return value
    .split(/\s+/)
    .map((part) => {
      const key = part.split('=')[0] ?? '';
      return SECRET_PATTERN.test(key) ? `${key}=<redacted>` : part;
    })
    .join(' ');
}

function dataOf(result: ActionResult): Record<string, unknown> {
  return result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : {};
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function numberField(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === 'number' ? value : undefined;
}

function statusFor(result: ActionResult): 'completed' | 'failed' | 'blocked' {
  if (result.ok) return 'completed';
  return result.reason === 'requires-confirmation' || result.reason.endsWith('-restricted') ? 'blocked' : 'failed';
}

function isBlockedFailure(result: ActionResult): boolean {
  return !result.ok && (result.reason === 'entitlement-restricted' || result.reason === 'usage-restricted' || result.reason === 'security-restricted' || result.reason === 'coding-mode-restricted');
}

function commandEvidence(request: ActionRequest, result: ActionResult, timing: { startedAt: number; endedAt: number } | undefined): ExecutionCommandEvidence | null {
  if (request.type !== 'runCommand' && request.type !== 'startProcess' && request.type !== 'buildProject') return null;
  const data = dataOf(result);
  const command = request.type === 'buildProject' ? request.buildCommand : request.command;
  const cwd = request.type === 'buildProject' ? request.cwd : request.cwd;
  const output = stringField(data, 'output') ?? (!result.ok ? result.message : undefined);
  return {
    command,
    safeCommand: redactSecretText(command),
    cwd,
    startedAt: timing?.startedAt ?? Date.now(),
    completedAt: timing?.endedAt ?? Date.now(),
    durationMs: timing ? Math.max(0, timing.endedAt - timing.startedAt) : 0,
    exitCode: numberField(data, 'exitCode') ?? (result.ok ? 0 : undefined),
    status: statusFor(result),
    output: output ? redactSecretText(output).slice(-OUTPUT_LIMIT) : undefined,
  };
}

function fileEvidence(request: ActionRequest, result: ActionResult, timestamp: number): ExecutionFileEvidence[] {
  const status = statusFor(result);
  if (request.type === 'writeFile') {
    const overwritten = (dataOf(result).overwritten as boolean | undefined) === true;
    return [{ operation: overwritten ? 'MODIFY' : 'CREATE', path: request.path, timestamp, result: status }];
  }
  if (request.type === 'createFolder') return [{ operation: 'CREATE', path: request.path, timestamp, result: status }];
  if (request.type === 'deletePath') return [{ operation: 'DELETE', path: request.path, timestamp, result: status }];
  if (request.type === 'movePath') return [{ operation: 'RENAME', path: `${request.from} -> ${request.to}`, timestamp, result: status }];
  if (request.type === 'applyCodeEdit') return [{ operation: 'MODIFY', path: request.path, timestamp, result: status }];
  if (request.type === 'copyPath' || request.type === 'compressPath' || request.type === 'extractArchive' || request.type === 'mergeFolders' || request.type === 'splitFile') {
    return [{ operation: 'CREATE', path: request.to, timestamp, result: status }];
  }
  if (request.type === 'printBrowserPageToPdf') return [{ operation: 'CREATE', path: request.savePath, timestamp, result: status }];
  const to = stringField(dataOf(result), 'to');
  if (request.type === 'duplicatePath' && to) return [{ operation: 'CREATE', path: to, timestamp, result: status }];
  return [];
}

function diffEvidence(request: ActionRequest, result: ActionResult, timestamp: number): ExecutionDiffEvidence | null {
  if (request.type !== 'gitDiffStat' || !result.ok) return null;
  const data = result.data as CodeDiffStat | undefined;
  if (!data || !Array.isArray(data.filesChanged)) return null;
  return {
    timestamp,
    filesChanged: data.filesChanged,
    totalAdded: data.totalAdded,
    totalDeleted: data.totalDeleted,
    summary: `${data.filesChanged.length} file${data.filesChanged.length === 1 ? '' : 's'} changed, +${data.totalAdded}/-${data.totalDeleted} lines.`,
  };
}

function verificationEvidence(request: ActionRequest, result: ActionResult, timing: { startedAt: number; endedAt: number } | undefined): ExecutionVerificationEvidence[] {
  const data = dataOf(result);
  const timestamp = timing?.endedAt ?? Date.now();
  const durationMs = timing ? Math.max(0, timing.endedAt - timing.startedAt) : undefined;
  const out: ExecutionVerificationEvidence[] = [];
  const add = (entry: Omit<ExecutionVerificationEvidence, 'timestamp' | 'durationMs'>) => out.push({ ...entry, timestamp, durationMs });

  if (request.type === 'runCommand') {
    const tests = data.testResults as TestRunSummary | undefined;
    if (tests) {
      add({
        type: 'TEST',
        action: request.command,
        status: tests.status === 'passed' ? 'passed' : tests.status === 'failed' ? 'failed' : result.ok ? 'passed' : 'failed',
        summary: `Test command ${tests.status}.`,
        failureReason: tests.failureDetail,
      });
    }
  }
  if (request.type === 'buildProject') {
    add({
      type: 'BUILD',
      action: request.buildCommand,
      status: result.ok ? 'passed' : 'failed',
      summary: result.ok ? 'Build passed.' : 'Build failed.',
      failureReason: result.ok ? undefined : result.message,
    });
  }
  if (request.type === 'runValidationPipeline') {
    const steps = ['syntax', 'imports', 'typeCheck', 'lint', 'build', 'tests'] as const;
    for (const step of steps) {
      const value = data[step] as { status?: 'passed' | 'failed' | 'skipped'; command?: string; errorDetail?: string; skippedReason?: string; durationMs?: number } | undefined;
      if (!value?.status) continue;
      add({
        type: step === 'typeCheck' ? 'TYPECHECK' : step === 'build' ? 'BUILD' : step === 'tests' ? 'TEST' : step === 'lint' ? 'LINT' : 'VALIDATION',
        action: value.command ?? step,
        status: value.status,
        summary: `${step} ${value.status}.`,
        failureReason: value.errorDetail ?? value.skippedReason,
      });
    }
  }
  if (request.type === 'checkProcessHealth') {
    add({ type: 'HEALTH_CHECK', action: request.url ?? request.processId, status: result.ok ? 'passed' : 'failed', summary: result.ok ? 'Health check passed.' : 'Health check failed.', failureReason: result.ok ? undefined : result.message, target: request.url });
  }
  if (request.type === 'devBrowserPreview') {
    add({ type: 'PREVIEW', action: request.sessionId, status: result.ok ? 'passed' : 'failed', summary: result.ok ? 'Preview screenshot captured.' : 'Preview capture failed.', failureReason: result.ok ? undefined : result.message });
  }
  if (request.type === 'verifyRenderedUi') {
    const visual = result.data as VisualEvidence | undefined;
    add({
      type: 'VISUAL_QA',
      action: request.sessionId,
      status: result.ok && visual?.ok ? 'passed' : 'failed',
      summary: visual?.issues?.length ? `Visual QA found ${visual.issues.length} issue${visual.issues.length === 1 ? '' : 's'}.` : result.ok ? 'Visual QA completed.' : 'Visual QA failed.',
      failureReason: visual?.issues?.join(' ') ?? (!result.ok ? result.message : undefined),
      screenshotRef: visual?.base64Png ? 'embedded:base64Png' : undefined,
    });
  }
  return out;
}

/**
 * Deterministic coordination layer between the LLM (all reasoning, via
 * ConversationRuntime/ReasoningRuntime) and DesktopExecutionEngine (single-
 * action execution) — never calls the model, never decides what action runs
 * next. Owns the ExecutionQueue (ordering) and accumulates one ExecutionRecord
 * per user request (== one conversation turn, no new boundary invented),
 * persisting it once the request concludes. This is the foundation for
 * Resume/Continue/Timeline/Analytics — internal name "Execution," but
 * anything user-facing calls this Work History / Completed Work / Timeline.
 */
export class ExecutionSupervisor {
  readonly queue = new ExecutionQueue();
  private current: ExecutionRecord | null = null;
  /** Requests already run successfully in this execution, keyed by a structural signature — an identical repeat request short-circuits instead of running again. */
  private completedResults = new Map<string, ActionResult>();

  constructor(private persist: (record: ExecutionRecord) => void) {}

  private persistCurrent(): void {
    if (this.current) this.persist({ ...this.current });
  }

  begin(goal: string, opts?: { externalRunId?: string }): void {
    this.current = {
      id: uuidv4(),
      goal,
      status: 'in_progress',
      startedAt: Date.now(),
      applicationsUsed: [],
      aiWorkersUsed: [],
      commandsExecuted: [],
      filesCreated: [],
      filesModified: [],
      verificationResults: [],
      commandEvidence: [],
      fileEvidence: [],
      diffEvidence: [],
      verificationEvidence: [],
      recoveryAttempts: 0,
      timeline: [],
      summary: '',
      externalRunId: opts?.externalRunId,
    };
    this.completedResults.clear();
    this.persistCurrent();
  }

  private signature(request: ActionRequest): string {
    return JSON.stringify(request, Object.keys(request).sort());
  }

  /** Already ran this exact request successfully in this execution — reuse that result instead of doing it again. */
  findDuplicate(request: ActionRequest): ActionResult | undefined {
    return this.completedResults.get(this.signature(request));
  }

  /** Called once a queued action's real result is known — folds it into the current record and remembers it for dedup. */
  recordAction(request: ActionRequest, result: ActionResult, timing?: { label: string; startedAt: number; endedAt: number }): void {
    if (!this.current) return;
    if (result.ok) this.completedResults.set(this.signature(request), result);

    if (timing) {
      this.current.timeline.push({ type: request.type, ok: result.ok, label: timing.label, startedAt: timing.startedAt, endedAt: timing.endedAt });
    }

    const endedAt = timing?.endedAt ?? Date.now();
    const command = commandEvidence(request, result, timing);
    if (command) this.current.commandEvidence = [...(this.current.commandEvidence ?? []), command];
    const files = fileEvidence(request, result, endedAt);
    if (files.length > 0) this.current.fileEvidence = [...(this.current.fileEvidence ?? []), ...files];
    const diff = diffEvidence(request, result, endedAt);
    if (diff) this.current.diffEvidence = [...(this.current.diffEvidence ?? []), diff];
    const verifications = verificationEvidence(request, result, timing);
    if (verifications.length > 0) this.current.verificationEvidence = [...(this.current.verificationEvidence ?? []), ...verifications];

    if (request.type === 'openApp') pushUnique(this.current.applicationsUsed, request.appId);

    if ((request.type === 'runCommand' || request.type === 'startProcess') && result.ok) {
      const worker = firstToken(request.command);
      if (AI_WORKER_PREFIXES.includes(worker)) pushUnique(this.current.aiWorkersUsed, worker);
      this.current.commandsExecuted.push(request.command);
    }
    if (request.type === 'createFolder' && result.ok) pushUnique(this.current.filesCreated, request.path);
    if (request.type === 'writeFile' && result.ok) pushUnique(this.current.filesModified, request.path);
    if (request.type === 'movePath' && result.ok) pushUnique(this.current.filesModified, request.to);
    if (request.type === 'deletePath' && result.ok) pushUnique(this.current.filesModified, request.path);
    if (request.type === 'restorePath' && result.ok) pushUnique(this.current.filesModified, request.path);
    if ((request.type === 'copyPath' || request.type === 'compressPath' || request.type === 'extractArchive' || request.type === 'mergeFolders' || request.type === 'splitFile') && result.ok) {
      const overwritten = (result.data as { overwritten?: boolean } | undefined)?.overwritten;
      pushUnique(overwritten ? this.current.filesModified : this.current.filesCreated, request.to);
    }
    if (request.type === 'printBrowserPageToPdf' && result.ok) {
      const overwritten = (result.data as { overwritten?: boolean } | undefined)?.overwritten;
      pushUnique(overwritten ? this.current.filesModified : this.current.filesCreated, request.savePath);
    }
    if (request.type === 'duplicatePath' && result.ok) {
      const to = (result.data as { to?: string } | undefined)?.to;
      if (to) pushUnique(this.current.filesCreated, to);
    }

    const trail = result.trail as ExecutionTrail | undefined;
    if (trail) {
      this.current.recoveryAttempts += trail.attempts;
      for (const obs of trail.observations) {
        this.current.verificationResults.push({ description: obs.message, ok: result.ok });
      }
    }
    if (request.type === 'verifyToolInstalled' || request.type === 'verifyDeployment' || request.type === 'checkProcessHealth') {
      this.current.verificationResults.push({ description: `${request.type}: ${result.ok ? 'passed' : 'failed'}`, ok: result.ok });
    }
    if (!result.ok && isBlockedFailure(result)) {
      this.current.status = 'abandoned';
      this.current.stoppedReason = result.message ?? 'Execution was blocked before the action ran.';
      this.current.nextAction =
        result.reason === 'entitlement-restricted' || result.reason === 'coding-mode-restricted'
          ? 'Upgrade to Paw Pro and enable the Coding Runtime entitlement.'
          : result.reason === 'usage-restricted'
            ? 'Review Paw Compute usage and add credits or contact the administrator.'
            : 'Review the selected workspace/security boundary and retry.';
    }
    this.persistCurrent();
  }

  /**
   * Deterministic completion — status is derived from the turn's own ended
   * reason plus what's already tracked, never a new model judgment. The
   * actual judgment that the user's goal is satisfied still comes entirely
   * from the model choosing to stop calling tools and produce a final reply;
   * this only records the outcome honestly.
   */
  end(endedReason: 'completed' | 'interrupted' | 'error', summary: string): void {
    if (!this.current) return;
    const hasFailedAction = this.current.timeline.some((entry) => !entry.ok);
    const hasBlockedAction = Boolean(this.current.stoppedReason);
    const status: ExecutionRecord['status'] =
      hasBlockedAction ? 'abandoned' : endedReason === 'completed' && !hasFailedAction ? 'completed' : endedReason === 'interrupted' ? 'abandoned' : 'failed';

    const finished: ExecutionRecord = {
      ...this.current,
      status,
      completedAt: Date.now(),
      durationMs: Date.now() - this.current.startedAt,
      summary,
    };
    this.current = null;
    this.persist(finished);
  }
}
