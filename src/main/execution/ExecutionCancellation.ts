import { AsyncLocalStorage } from 'async_hooks';
import { execFile } from 'child_process';

/**
 * Cancellation for one execution (one user request — ExecutionRecord.id), at the main-process end.
 *
 * DesktopExecutionEngine runs every action that carries an executionId inside
 * `runInExecution(executionId, actionType, fn)`. Anything that starts real OS work while that action
 * runs registers a way to stop it with `registerStop()` — execShellCommand registers its child
 * process tree, BuildProjectPlugin its managed build process — found through AsyncLocalStorage, so
 * no plugin signature changes. `cancel(executionId)` then:
 *
 *   1. marks the execution cancelled (later actions for it are refused before they start),
 *   2. stops every registered process of THAT execution only (process tree on Windows),
 *   3. reports whether the in-flight action is one with no stop mechanism (it is left to finish —
 *      never killed blind — and its result is discarded by the engine and the renderer),
 *   4. lets the caller wait until the in-flight action has actually returned (`waitUntilIdle`) —
 *      the renderer shows "Cancelling" until then.
 */

type StopFn = () => Promise<void> | void;

type InFlight = { actionType: string; startedAt: number; stops: Set<StopFn>; done: Promise<void>; resolveDone: () => void };

type ExecutionState = { cancelledAt: number | null; inFlight: InFlight | null };

const context = new AsyncLocalStorage<{ executionId: string; inFlight: InFlight }>();
const executions = new Map<string, ExecutionState>();
/** Cancelled ids are remembered so a late action for a cancelled execution is still refused; bounded. */
const MAX_REMEMBERED = 500;
/** Told when a cancelled execution's running step has really returned (nothing of it runs any more). */
const settledListeners = new Set<(executionId: string) => void>();

/** Subscribe to "a cancelled execution has nothing running any more". Returns an unsubscribe function. */
export function onCancelledExecutionSettled(listener: (executionId: string) => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}

/** True while any execution has a step running (a revert waits, so it never races a task's write). */
export function anyActionInFlight(): boolean {
  for (const state of executions.values()) if (state.inFlight) return true;
  return false;
}

function stateFor(executionId: string): ExecutionState {
  let state = executions.get(executionId);
  if (!state) {
    state = { cancelledAt: null, inFlight: null };
    executions.set(executionId, state);
    if (executions.size > MAX_REMEMBERED) {
      for (const [id, s] of executions) {
        if (executions.size <= MAX_REMEMBERED) break;
        if (!s.inFlight) executions.delete(id);
      }
    }
  }
  return state;
}

/** Ends a process and everything it started. Windows: `taskkill /T /F` (same as ProcessManager.stop). */
export function killProcessTree(pid: number | undefined, fallback?: () => void): Promise<void> {
  if (!pid) {
    fallback?.();
    return Promise.resolve();
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      fallback?.();
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
  });
}

export function isExecutionCancelled(executionId: string | undefined): boolean {
  return !!executionId && (executions.get(executionId)?.cancelledAt ?? null) !== null;
}

/** The execution the calling code is running for, if any (read inside a plugin or a helper it calls). */
export function currentExecutionId(): string | undefined {
  return context.getStore()?.executionId;
}

/**
 * Registers how to stop work started by the action currently running. Returns an unregister
 * function (call it when that work ends on its own). Outside any execution this is a no-op.
 * If the execution was already cancelled, the work is stopped immediately.
 */
export function registerStop(stop: StopFn): () => void {
  const store = context.getStore();
  if (!store) return () => {};
  store.inFlight.stops.add(stop);
  if (isExecutionCancelled(store.executionId)) void Promise.resolve(stop()).catch(() => {});
  return () => store.inFlight.stops.delete(stop);
}

/** Runs one action of an execution. Only one action per execution is in flight at a time (the renderer's queue is serial). */
export async function runInExecution<T>(executionId: string, actionType: string, fn: () => Promise<T>): Promise<T> {
  const state = stateFor(executionId);
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => (resolveDone = resolve));
  const inFlight: InFlight = { actionType, startedAt: Date.now(), stops: new Set(), done, resolveDone };
  state.inFlight = inFlight;
  try {
    return await context.run({ executionId, inFlight }, fn);
  } finally {
    if (state.inFlight === inFlight) state.inFlight = null;
    resolveDone();
    if (state.cancelledAt !== null && !state.inFlight) {
      for (const listener of [...settledListeners]) {
        try {
          listener(executionId);
        } catch {
          // a listener's failure never affects the execution
        }
      }
    }
  }
}

export type CancelExecutionResult = {
  /** The execution had an action running when cancel arrived. */
  hadRunningAction: boolean;
  /** Type of that action (for "waiting for X to stop" wording). */
  runningActionType: string | null;
  /** How many stop mechanisms (processes) were signalled. */
  stopped: number;
  /** The running action has no stop mechanism — it is left to finish on its own; its result will be discarded. */
  nonCancellable: boolean;
};

/** Cancels exactly this execution. Idempotent: a second call re-signals nothing already signalled. */
export async function cancelExecution(executionId: string): Promise<CancelExecutionResult> {
  const state = stateFor(executionId);
  if (state.cancelledAt === null) state.cancelledAt = Date.now();
  const inFlight = state.inFlight;
  if (!inFlight) return { hadRunningAction: false, runningActionType: null, stopped: 0, nonCancellable: false };
  const stops = [...inFlight.stops];
  inFlight.stops.clear();
  await Promise.all(stops.map((stop) => Promise.resolve(stop()).catch(() => {})));
  return { hadRunningAction: true, runningActionType: inFlight.actionType, stopped: stops.length, nonCancellable: stops.length === 0 };
}

/** Resolves true once the execution has no action in flight, or false after `timeoutMs`. */
export async function waitUntilIdle(executionId: string, timeoutMs: number): Promise<boolean> {
  const inFlight = executions.get(executionId)?.inFlight;
  if (!inFlight) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), timeoutMs)));
  const finished = await Promise.race([inFlight.done.then(() => true as const), timedOut]);
  if (timer) clearTimeout(timer);
  return finished;
}

/** What is running for an execution right now (diagnostics for a "Cancelling" or stalled task). */
export function inFlightAction(executionId: string): { actionType: string; startedAt: number } | null {
  const inFlight = executions.get(executionId)?.inFlight;
  return inFlight ? { actionType: inFlight.actionType, startedAt: inFlight.startedAt } : null;
}

/** Test-only reset. */
export function __resetExecutionCancellationForTests(): void {
  executions.clear();
  settledListeners.clear();
}
