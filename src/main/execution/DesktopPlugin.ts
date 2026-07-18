import type { ActionRequest, ActionRequirement, ActionResult } from '../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../shared/actions/ExecutionLifecycle';

export type PrepareResult = {
  /** Non-empty means "ask the user this before running" — same shape/semantics as requirements(). */
  requirements: ActionRequirement[];
  /** If set, an equivalent resource already satisfies this request (e.g. ResourceManager found the app already open, the package already installed) — the engine skips execute() entirely and treats this as its result, going straight to verify(). */
  reuse?: ActionResult;
};

/**
 * One desktop skill, self-contained. Paw only ever decides WHICH plugin
 * handles a request (via canHandle) — everything about HOW it's done,
 * what's missing before it can run, and how to talk about it naturally
 * lives inside the plugin itself. Adding a new skill later (Excel, Power BI,
 * VS Code, Blender, ...) means writing one new plugin, never touching a
 * central switch statement.
 */
export interface DesktopPlugin {
  id: string;

  /** Does this plugin own this request? */
  canHandle(request: ActionRequest): boolean;

  /** What's missing before this can run — e.g. a piece of information the user hasn't given yet. Empty array means ready to execute. */
  requirements(request: ActionRequest): ActionRequirement[];

  /** Pre-flight staging beyond "what's missing from the user" — resolving ambiguity, ensuring idempotent preconditions, or (via ResourceManager) short-circuiting execute() entirely when an equivalent resource already exists. */
  prepare(request: ActionRequest): Promise<PrepareResult>;

  /** Does the real thing. */
  execute(request: ActionRequest): Promise<ActionResult>;

  /** For long-running/GUI actions, intermediate signals surfaced just after execute() returns (executeResult carries whatever execute() produced, e.g. a processId to poll) — reuses existing verification primitives (process output, HTTP health, OS process checks) rather than inventing new polling. Most plugins have nothing worth observing beyond their own execute()/verify() result. */
  observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent>;

  /** Best-effort confirmation the result is real, folded into execute()'s own return value — not a fabricated deeper check when there's nothing honest to verify beyond "did the call itself succeed." */
  verify(request: ActionRequest, result: ActionResult): Promise<ActionResult>;

  /** Given a failed verify(), attempt exactly one remediation strategy (force-reinstall, restart, retry with a fallback) and return a fresh result for the engine to re-verify. Most plugins can't safely auto-remediate and just return the failure unchanged. */
  recover(request: ActionRequest, result: ActionResult): Promise<ActionResult>;

  /** Natural, conversational phrasing — never "Action executed successfully." */
  describeInProgress(request: ActionRequest): string;
  describeDone(request: ActionRequest, result: ActionResult): string;
}
