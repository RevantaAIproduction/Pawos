import { v4 as uuidv4 } from 'uuid';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import type { ExecutionTrail } from '../../shared/actions/ExecutionLifecycle';
import { ExecutionQueue } from './ExecutionQueue';

const AI_WORKER_PREFIXES = ['claude', 'codex', 'gemini', 'ollama'];

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
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

  begin(goal: string): void {
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
      recoveryAttempts: 0,
      timeline: [],
      summary: '',
    };
    this.completedResults.clear();
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
    const status: ExecutionRecord['status'] =
      endedReason === 'completed' ? 'completed' : endedReason === 'interrupted' ? 'abandoned' : 'failed';

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
