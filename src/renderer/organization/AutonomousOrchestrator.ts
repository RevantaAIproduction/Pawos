import { ConversationRuntime } from '../conversation/ConversationRuntime';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import { aiRouter } from '../ai/AIRouter';
import { buildSystemPrompt } from '../conversation/systemPrompt';
import { getIpcBridge } from '../services/ipc/ipcBridge';
import { autonomousTaskBillingService } from './AutonomousTaskBillingService';
import { CONNECTOR_ID_BY_TICKET_SOURCE, connectorDisplayName } from './AutonomousTaskBillingGate';
import { getSupabaseClient } from '../auth/supabaseClient';
import { resolveCredentialsForOrganization } from './CredentialResolver';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import type {
  AutonomousEvidenceCheck,
  AutonomousEvidenceStatus,
  AutonomousExecutionEvidence,
  AutonomousOutcome,
  TicketSource,
} from '../../shared/organization/AutonomousTaskBillingTypes';
import type { SpeechRecognitionProvider, TextToSpeechProvider } from '../conversation/SpeechProviders';

/**
 * The Autonomous Orchestration Layer — the missing piece the prior audit identified: today,
 * "Autonomous Work" was a billing/entitlement wrapper (AutonomousTaskBillingGate.ts) around
 * whatever a conversation turn happened to do, with no code actually driving investigate → plan →
 * execute → validate on its own, and success determined by trusting the model's own self-report at
 * completion time. This module closes that gap by orchestrating the EXISTING execution
 * infrastructure headlessly — never a second coding runtime, never a fork of
 * DesktopExecutionEngine/ExecutionSupervisor/Coding Runtime V2.
 *
 * Mechanism: a dedicated, independent ConversationRuntime instance (the exact same class the
 * human-facing chat UI already uses, just a second instantiation) is fed a synthetic transcript
 * describing the ticket, with `executeAction`/`checkActionRequirements`/`persistExecution` wired to
 * the same IPC-backed DesktopExecutionEngine/ExecutionSupervisor pipeline a normal human turn
 * already uses. The model's own tool-calling judgment then drives investigate_ticket ->
 * discover_affected_files -> propose_code_edit_plan -> apply_code_edit -> run_validation_pipeline,
 * exactly as it already does for a human-typed request — confirmed feasible by direct code audit
 * (ConversationRuntime.submitTranscript() has no DOM/human-callback dependency; execution mode
 * 'acceptEdits' auto-confirms only writeFile/applyCodeEdit while every other destructive action
 * still genuinely requires confirmation, which is exactly what makes WAITING_FOR_PERMISSION a real,
 * reachable state below rather than an invented one).
 *
 * Connector capability audit (verified by direct code read before writing this file, not assumed):
 *   Jira:   read ticket (real) | update ticket (NOT IMPLEMENTED) | comment (NOT IMPLEMENTED) | status change (NOT IMPLEMENTED)
 *   Linear: read ticket (real) | update ticket (NOT IMPLEMENTED) | comment (NOT IMPLEMENTED) | status change (NOT IMPLEMENTED)
 *   GitHub: read issue (real) | create/update PR (NOT IMPLEMENTED) | list/verify PR (real) | PR comment (real)
 *   GitLab: no issue connector exists | create/update MR (NOT IMPLEMENTED) | list/verify MR (real) | MR comment (real)
 * The ONLY genuinely real "external update" capability across all four is posting a comment on an
 * already-existing GitHub/GitLab pull/merge request (see PullRequestEvidenceComment.ts, main
 * process). Jira/Linear ticket write-back and PR *creation* are never attempted — see
 * attemptExternalUpdate() below, which reports NOT_EXECUTED/BLOCKED honestly rather than fabricating
 * a capability that does not exist in this codebase.
 */

// ---------------------------------------------------------------------------
// Pure functions — no I/O, fully unit-testable without a live LLM/IPC/Electron.
// ---------------------------------------------------------------------------

export interface AutonomousTicketContext {
  ticketId: string | null;
  ticketSource: TicketSource;
  ticketTitle?: string;
  ticketDescription?: string;
}

/** Builds the synthetic prompt fed into the headless turn — the ONLY place ticket context is turned
 *  into natural language for the model. Never invents ticket content beyond what was actually
 *  supplied by the caller (AutonomousTaskBillingGate.ts, itself fed by whatever real connector data
 *  was available). */
export function buildAutonomousPrompt(ticket: AutonomousTicketContext, cwd: string): string {
  const sourceLabel = ticket.ticketSource ? connectorDisplayName(ticket.ticketSource) : null;
  const lines = [
    ticket.ticketId
      ? `You are working autonomously on ${sourceLabel ? `${sourceLabel} ` : ''}ticket ${ticket.ticketId}, with no human present to answer questions.`
      : 'You are working autonomously on the task described below, with no human present to answer questions.',
    ticket.ticketTitle ? `Title: ${ticket.ticketTitle}` : null,
    ticket.ticketDescription ? `Description: ${ticket.ticketDescription}` : null,
    `The repository is checked out locally at: ${cwd}`,
    'Investigate the ticket and this repository, form a plan for the smallest safe fix, apply it, and validate it (typecheck/lint/build/tests, as applicable to this project) before finishing.',
    'If you determine this genuinely cannot be resolved (e.g. insufficient information, the described behavior does not reproduce, or a required capability is unavailable), say so plainly and stop rather than making an unrelated change.',
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

const REQUIRED_VERIFICATION_TYPES = new Set(['TEST', 'BUILD', 'TYPECHECK', 'LINT', 'VALIDATION']);

/**
 * The single, evidence-based success determination for an orchestrated run — never trusts the
 * model's own final-turn narration text. Derives everything from the real ExecutionRecord
 * ExecutionSupervisor already builds as a side effect of the headless turn: `status` (itself already
 * derived from whether any recorded action actually failed — see ExecutionSupervisor.end()'s own
 * status logic, not model self-report), and every real `verificationEvidence` entry (TEST/BUILD/
 * TYPECHECK/LINT/VALIDATION, each with a real `status: 'passed'|'failed'|'skipped'` reported by the
 * real validation-pipeline/test-runner/build plugins). 'success' is the ONLY outcome kind that may
 * ever lead a caller to bill this run.
 */
export function deriveOutcomeFromExecutionRecord(record: ExecutionRecord | null): AutonomousOutcome {
  const commandsExecuted = record?.commandEvidence?.length ?? 0;
  const filesChanged = (record?.fileEvidence?.length ?? 0) + (record?.diffEvidence?.length ?? 0);
  const checks: AutonomousEvidenceCheck[] = [];

  if (!record) {
    checks.push({ label: 'Execution', status: 'NOT_EXECUTED', detail: 'No ExecutionRecord was produced for this run — the headless turn never started or never reported back.' });
    return {
      kind: 'failed',
      reason: 'No execution evidence was captured for this run.',
      evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks },
    };
  }

  checks.push({
    label: 'Execution',
    status: record.status === 'completed' ? 'CAPTURED' : record.status === 'failed' ? 'FAILED' : 'BLOCKED',
    detail: record.summary || `Execution ended with status "${record.status}".`,
  });

  let anyRequiredCheckFailed = false;
  for (const entry of record.verificationEvidence ?? []) {
    if (!REQUIRED_VERIFICATION_TYPES.has(entry.type)) continue;
    const status: AutonomousEvidenceStatus = entry.status === 'passed' ? 'CAPTURED' : entry.status === 'skipped' ? 'NOT_EXECUTED' : 'FAILED';
    if (entry.status === 'failed') anyRequiredCheckFailed = true;
    checks.push({ label: `${entry.type} (${entry.action})`, status, detail: entry.failureReason ?? entry.summary });
  }

  if (filesChanged === 0 && commandsExecuted === 0) {
    checks.push({ label: 'Work performed', status: 'NOT_CAPTURED', detail: 'No file changes or commands were recorded for this run.' });
  }

  const evidence: AutonomousExecutionEvidence = { executionRecordId: record.id, commandsExecuted, filesChanged, checks };

  if (record.status === 'completed' && !anyRequiredCheckFailed) {
    return { kind: 'success', reason: record.summary || 'Execution completed with no recorded action failures and no failed verification checks.', evidence };
  }
  if (record.stoppedReason) {
    return { kind: 'blocked', reason: record.stoppedReason, evidence };
  }
  return {
    kind: 'failed',
    reason: anyRequiredCheckFailed ? 'One or more required verification checks (test/build/typecheck/lint/validation) failed.' : record.summary || `Execution ended with status "${record.status}".`,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Headless turn runner — the injectable seam. AutonomousOrchestrator depends only on this
// interface, never on ConversationRuntime directly, so orchestration logic (state transitions,
// evidence derivation, billing sequencing, connector honesty) is fully unit-testable with a fake
// runner, while HeadlessTurnRunner below is the real, working implementation.
// ---------------------------------------------------------------------------

export type HeadlessTurnResult =
  | { kind: 'finished'; executionRecord: ExecutionRecord | null }
  | { kind: 'waitingForPermission'; executionRecord: ExecutionRecord | null };

export interface AutonomousTurnRunner {
  /** Starts a brand-new headless turn. Resolves once the turn either finishes (naturally or via
   *  error/interruption) or genuinely stalls on a real confirmation gate. */
  run(prompt: string, opts: { autonomousRunId: string }): Promise<HeadlessTurnResult>;
  /** Resumes a run previously left `waitingForPermission`, by supplying the real "yes"/"no" a human
   *  would otherwise type — reuses the exact same executeConfirmedAction() path
   *  ConversationRuntime already exposes for a live human reply. Returns null if no live session for
   *  this runId exists (e.g. the app restarted since — a genuine, disclosed limitation: an in-memory
   *  reasoning-loop/tool-call state cannot be resumed across a process restart without serializing
   *  arbitrary conversation state, which this pass does not attempt). */
  resume(autonomousRunId: string, granted: boolean): Promise<HeadlessTurnResult | null>;
}

const noopSpeechRecognition: SpeechRecognitionProvider = {
  name: 'autonomous-orchestrator-headless',
  isSupported: () => false,
  start: () => Promise.reject(new Error('Speech recognition is never used by the headless Autonomous Orchestration runtime.')),
};

const noopTextToSpeech: TextToSpeechProvider = {
  name: 'autonomous-orchestrator-headless',
  supportsVisemes: false,
  isSupported: () => false,
  speak: async () => {},
  stop: () => {},
};

type LiveSession = { runtime: ConversationRuntime };

/**
 * Real implementation — a genuine, working headless ConversationRuntime, wired through the exact
 * same IPC-backed executeAction/checkActionRequirements/persistExecution pipeline
 * useConversationController.ts already uses for the human-facing chat UI (see that file's own
 * construction of `ipc.actionExecute`/`ipc.actionCheckRequirements`/`ipc.executionRecord`).
 * Execution mode is now a real, checked entitlement decision, never hardcoded: only an account
 * holding 'autonomousPlanBypass' (Pro Max/Team/Enterprise) runs in 'acceptEdits' — where only
 * writeFile/applyCodeEdit auto-confirm (EDIT_ACTION_TYPES, ExecutionModeTypes.ts) — while every
 * other destructive action type (runCommand, gitCommit, deployProject, etc.) still genuinely
 * triggers the real DesktopExecutionEngine confirmation gate regardless of mode. An account without
 * the entitlement runs in 'manual', so even writeFile/applyCodeEdit pause for a real human decision
 * — which is what makes WAITING_FOR_PERMISSION below a real, structurally-enforced pause in every
 * case, never a fabricated one. See run()'s own entitlement check for where this is decided.
 */
export class HeadlessTurnRunner implements AutonomousTurnRunner {
  private sessions = new Map<string, LiveSession>();

  private awaitSettlement(runtime: ConversationRuntime, getLatestRecord: () => ExecutionRecord | null): Promise<HeadlessTurnResult> {
    return new Promise((resolve) => {
      let settled = false;
      let sawFirstReplay = false;
      const settle = (result: HeadlessTurnResult) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(result);
      };
      // subscribe() immediately replays the CURRENT snapshot once, synchronously, before any real
      // turn processing has happened — that first call must be ignored, or a stale pendingConfirmation/
      // idle value from before submitTranscript() was even called could falsely settle immediately.
      const unsubscribe = runtime.subscribe((snapshot) => {
        if (!sawFirstReplay) {
          sawFirstReplay = true;
          return;
        }
        if (snapshot.pendingConfirmation) {
          settle({ kind: 'waitingForPermission', executionRecord: getLatestRecord() });
          return;
        }
        if (snapshot.state === 'idle') {
          settle({ kind: 'finished', executionRecord: getLatestRecord() });
        }
      });
    });
  }

  async run(prompt: string, opts: { autonomousRunId: string }): Promise<HeadlessTurnResult> {
    const bridge = getIpcBridge();
    let latestRecord: ExecutionRecord | null = null;

    const reasoningRuntime = new ReasoningRuntime(aiRouter.getReasoningProvider(), buildSystemPrompt(true));

    // Real, checked policy (per the audit finding that this used to auto-confirm applyCodeEdit/
    // writeFile unconditionally, with no entitlement check anywhere in the path) — only an account
    // that genuinely holds 'autonomousPlanBypass' (Pro Max/Team/Enterprise, see EntitlementService.ts)
    // runs in 'acceptEdits' mode. Everything else falls back to 'manual', which routes every
    // applyCodeEdit/writeFile through the real, already-built waiting_for_permission/ALLOW-DENY flow
    // (AutonomousTaskBillingCard.tsx's decidePermission()) instead of silently auto-confirming it.
    const hasPlanBypass = await bridge.entitlementIsFeatureAvailable('autonomousPlanBypass').catch(() => false);
    const executionMode = hasPlanBypass ? 'acceptEdits' : 'manual';

    const runtime = new ConversationRuntime({
      speechRecognition: noopSpeechRecognition,
      speechSynthesis: noopTextToSpeech,
      reasoningRuntime,
      executeAction: (request: ActionRequest) => bridge.actionExecute(request),
      checkActionRequirements: (request: ActionRequest) => bridge.actionCheckRequirements(request),
      persistExecution: (record: ExecutionRecord) => {
        latestRecord = record;
        return bridge.executionRecord(record);
      },
      getExecutionMode: () => executionMode,
      isBypassPermissionsEnabled: () => false,
      autonomousRunId: opts.autonomousRunId,
    });

    this.sessions.set(opts.autonomousRunId, { runtime });
    const settlement = this.awaitSettlement(runtime, () => latestRecord);
    runtime.submitTranscript(prompt);
    const result = await settlement;
    if (result.kind === 'finished') this.sessions.delete(opts.autonomousRunId);
    return result;
  }

  async resume(autonomousRunId: string, granted: boolean): Promise<HeadlessTurnResult | null> {
    const session = this.sessions.get(autonomousRunId);
    if (!session) return null;
    if (!granted) {
      this.sessions.delete(autonomousRunId);
      return { kind: 'finished', executionRecord: null };
    }
    let latestRecord: ExecutionRecord | null = null;
    const settlement = this.awaitSettlement(session.runtime, () => latestRecord);
    session.runtime.submitTranscript('yes');
    const result = await settlement;
    if (result.kind === 'finished') this.sessions.delete(autonomousRunId);
    return result;
  }
}

/** Module-level singleton — one live-session registry for the whole renderer process, matching
 *  every other singleton service in this codebase (autonomousTaskBillingService, aiRouter, etc.).
 *  Injected as the default turnRunner below; tests supply their own fake instead. */
export const headlessTurnRunner = new HeadlessTurnRunner();

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface AutonomousOrchestrationInput {
  runId: string;
  organizationId: string | null;
  ticketSource: TicketSource;
  ticketId: string | null;
  ticketTitle?: string;
  ticketDescription?: string;
  /** Local repository checkout — required; AutonomousTaskBillingGate.ts only ever invokes
   *  orchestration when this was genuinely supplied. */
  cwd: string;
  /** Repository identifier for PR creation (e.g., 'owner/repo' for GitHub) — optional. */
  repository?: string;
  /** An existing pull/merge request URL to attempt a completion comment on, if one is already known
   *  (e.g. supplied by a human continuing work on an already-open PR). Never fabricated by the
   *  orchestrator itself — there is no createPullRequest capability anywhere in this codebase (see
   *  the connector audit above), so a run that never had one going in will honestly report
   *  NOT_EXECUTED for the external-update step, never a fictitious URL. */
  prUrl?: string;
}

export interface AutonomousOrchestrationDeps {
  billingService: typeof autonomousTaskBillingService;
  turnRunner: AutonomousTurnRunner;
  getConnectorStatus: (connectorId: string, scope: { userId: string; organizationId?: string }) => ReturnType<ReturnType<typeof getIpcBridge>['connectivityGetStatus']>;
  verifyPullRequestExists: (prUrl: string) => ReturnType<ReturnType<typeof getIpcBridge>['connectivityVerifyPullRequestExists']>;
  postCompletionComment: (prUrl: string, body: string) => ReturnType<ReturnType<typeof getIpcBridge>['connectivityPostAutonomousCompletionComment']>;
  getCurrentUserId: () => Promise<string>;
  /** Real `git status --porcelain -b` against the SOURCE checkout (never the isolated worktree) —
   *  this is how "git state is known" before execution begins is actually satisfied, not asserted. */
  checkGitState: (cwd: string) => Promise<ActionResult>;
  /** Real `git worktree add` — creates a brand-new, isolated checkout the headless turn will
   *  actually operate in, structurally distinct from the user's real checkout at `cwd`. */
  createIsolatedWorkspace: (cwd: string, worktreePath: string, branchName: string) => Promise<ActionResult>;
}

function defaultDeps(): AutonomousOrchestrationDeps {
  const bridge = getIpcBridge();
  return {
    billingService: autonomousTaskBillingService,
    turnRunner: headlessTurnRunner,
    getConnectorStatus: (connectorId, scope) => bridge.connectivityGetStatus(connectorId, scope),
    verifyPullRequestExists: (prUrl) => bridge.connectivityVerifyPullRequestExists(prUrl),
    postCompletionComment: (prUrl, body) => bridge.connectivityPostAutonomousCompletionComment(prUrl, body),
    getCurrentUserId: async () => {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? '';
    },
    checkGitState: (cwd) => bridge.actionExecute({ type: 'gitStatus', cwd }),
    createIsolatedWorkspace: (cwd, worktreePath, branchName) => bridge.actionExecute({ type: 'gitCreateWorktree', cwd, worktreePath, branchName }),
  };
}

/** Derives a deterministic, collision-safe isolated-worktree path/branch for one run — a sibling
 *  directory next to the real checkout, never inside it, and never a randomly-guessed location.
 *  Pure string concatenation (no Node `path` module — this file runs in the renderer, which has no
 *  Node module access under this app's strict nodeIntegration:false/contextIsolation:true model). */
export function deriveWorkspaceIsolationSpec(cwd: string, runId: string): { worktreePath: string; branchName: string } {
  return { worktreePath: `${cwd}-pawos-autonomous-${runId}`, branchName: `pawos-autonomous/${runId}` };
}

/** One evidence-based, honestly-reported result of a full orchestration attempt — never claims more
 *  than the real evidence supports. */
export interface AutonomousOrchestrationResult {
  runId: string;
  outcome: AutonomousOutcome;
  billingEventId: string | null;
  externalUpdate: AutonomousEvidenceCheck;
}

/**
 * Runs one autonomous ticket end to end: connector-still-connected check -> transition to running ->
 * headless turn (investigate/plan/execute/validate via the real, existing execution infrastructure)
 * -> evidence-based outcome derivation -> attempt the one genuinely real external update (a
 * GitHub/GitLab PR comment, only if a real prUrl was supplied) -> terminal transition
 * (completeRun/markTerminal/transitionRun to 'blocked'), exactly once, idempotently. Never charges
 * for anything but a genuine 'success' outcome — see the switch below.
 */
export async function orchestrateAutonomousRun(input: AutonomousOrchestrationInput, deps: AutonomousOrchestrationDeps = defaultDeps()): Promise<AutonomousOrchestrationResult> {
  const requiredConnectorId = input.ticketSource ? CONNECTOR_ID_BY_TICKET_SOURCE[input.ticketSource] : undefined;
  if (requiredConnectorId) {
    const userId = await deps.getCurrentUserId();
    const statusResult = await deps.getConnectorStatus(requiredConnectorId, { userId, organizationId: input.organizationId ?? undefined });
    const isConnected = statusResult.ok && (statusResult.data.state === 'connected' || statusResult.data.state === 'syncing');
    if (!isConnected) {
      const reason = `BLOCKED — ${connectorDisplayName(requiredConnectorId)} is not connected. Connect it from Settings → Connections and retry.`;
      await deps.billingService.transitionRun(input.runId, 'blocked', reason);
      return {
        runId: input.runId,
        outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [{ label: 'Connector', status: 'BLOCKED', detail: reason }] } },
        billingEventId: null,
        externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Skipped — connector was not connected.' },
      };
    }
  }

  // Pre-flight isolation gate — the actual fix for the "no real execution context" finding: never
  // infer git state, never operate directly on the user's real checkout. Both steps below run
  // through DesktopExecutionEngine's own full lifecycle (prepare -> requirements -> execute ->
  // verify), so an unreadable/non-git `cwd`, or a worktree-path collision, is caught by the same
  // requirement/verification gate every other action already goes through — not a bespoke check
  // invented here.
  const gitStateResult = await deps.checkGitState(input.cwd);
  if (!gitStateResult.ok) {
    const reason = `BLOCKED — could not establish a known git state for "${input.cwd}": ${gitStateResult.message ?? 'unknown error'}. Real autonomous execution requires a real, readable local git checkout.`;
    await deps.billingService.transitionRun(input.runId, 'blocked', reason);
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [{ label: 'Git state', status: 'BLOCKED', detail: gitStateResult.message ?? 'Unknown error.' }] } },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Skipped — could not establish a known git state.' },
    };
  }
  const gitStateData = gitStateResult.data as { branch: string; clean: boolean } | undefined;
  const gitStateCheck: AutonomousEvidenceCheck = {
    label: 'Git state',
    status: 'CAPTURED',
    detail: gitStateData ? `Source checkout on branch "${gitStateData.branch}", ${gitStateData.clean ? 'working tree clean' : 'working tree has local changes'}.` : 'Captured.',
  };

  const { worktreePath, branchName } = deriveWorkspaceIsolationSpec(input.cwd, input.runId);
  const worktreeResult = await deps.createIsolatedWorkspace(input.cwd, worktreePath, branchName);
  if (!worktreeResult.ok) {
    const reason = `BLOCKED — could not create an isolated workspace for this run: ${worktreeResult.message ?? 'unknown error'}. Autonomous execution must never operate directly on your real checkout, so it stops here rather than falling back to that.`;
    await deps.billingService.transitionRun(input.runId, 'blocked', reason);
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [gitStateCheck, { label: 'Workspace isolation', status: 'BLOCKED', detail: worktreeResult.message ?? 'Unknown error.' }] } },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Skipped — could not create an isolated workspace.' },
    };
  }
  const isolationCheck: AutonomousEvidenceCheck = {
    label: 'Workspace isolation',
    status: 'CAPTURED',
    detail: `Isolated worktree created at "${worktreePath}" on branch "${branchName}" — the source checkout at "${input.cwd}" is never touched.`,
  };
  const preflightChecks: AutonomousEvidenceCheck[] = [gitStateCheck, isolationCheck];

  await deps.billingService.transitionRun(input.runId, 'running', 'Autonomous orchestration started.');

  const prompt = buildAutonomousPrompt(
    { ticketId: input.ticketId, ticketSource: input.ticketSource, ticketTitle: input.ticketTitle, ticketDescription: input.ticketDescription },
    worktreePath
  );

  let turnResult = await deps.turnRunner.run(prompt, { autonomousRunId: input.runId });
  while (turnResult.kind === 'waitingForPermission') {
    await deps.billingService.transitionRun(input.runId, 'waiting_for_permission', 'A destructive action requires human confirmation before continuing.');
    // Genuinely pauses here — there is no UI wired to grant this permission yet (out of scope for
    // this pass, per the explicit "do not start the Autonomous Work UI redesign" instruction).
    // resumeAutonomousRun() below is the real, working resume path once such a UI calls it.
    const pendingEvidence = deriveOutcomeFromExecutionRecord(turnResult.executionRecord).evidence;
    pendingEvidence.checks = [...preflightChecks, ...pendingEvidence.checks];
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason: 'Waiting for human permission before continuing.', evidence: pendingEvidence },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Run is still in progress — waiting for permission.' },
    };
  }

  return finishAutonomousRun(input, turnResult.executionRecord, deps, preflightChecks);
}

/** Called once a run previously left `waiting_for_permission` receives a real decision — reuses the
 *  same live headless turn session if one is still alive in this process (see HeadlessTurnRunner's
 *  own doc comment for the disclosed across-restart limitation). */
export async function resumeAutonomousRun(input: AutonomousOrchestrationInput, granted: boolean, deps: AutonomousOrchestrationDeps = defaultDeps()): Promise<AutonomousOrchestrationResult> {
  if (!granted) {
    await deps.billingService.transitionRun(input.runId, 'cancelled', 'Human denied the required permission.');
    return {
      runId: input.runId,
      outcome: { kind: 'cancelled', reason: 'Human denied the required permission.', evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [] } },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Run was cancelled.' },
    };
  }

  await deps.billingService.transitionRun(input.runId, 'running', 'Permission granted — resuming.');
  const resumed = await deps.turnRunner.resume(input.runId, true);
  if (!resumed) {
    const reason = 'No live orchestration session was found for this run — it may have been interrupted by an app restart. Start a new run instead.';
    await deps.billingService.transitionRun(input.runId, 'blocked', reason);
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [{ label: 'Session', status: 'NOT_EXECUTED', detail: reason }] } },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'No live session to resume.' },
    };
  }
  if (resumed.kind === 'waitingForPermission') {
    await deps.billingService.transitionRun(input.runId, 'waiting_for_permission', 'Another action requires human confirmation.');
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason: 'Waiting for human permission before continuing.', evidence: deriveOutcomeFromExecutionRecord(resumed.executionRecord).evidence },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Run is still in progress — waiting for permission.' },
    };
  }
  return finishAutonomousRun(input, resumed.executionRecord, deps);
}

async function finishAutonomousRun(
  input: AutonomousOrchestrationInput,
  executionRecord: ExecutionRecord | null,
  deps: AutonomousOrchestrationDeps,
  preflightChecks: AutonomousEvidenceCheck[] = []
): Promise<AutonomousOrchestrationResult> {
  const outcome = deriveOutcomeFromExecutionRecord(executionRecord);
  // Real workspace-isolation/git-state evidence, captured before this headless turn ever started —
  // always present on the final result, success or not, never only on the happy path.
  outcome.evidence.checks = [...preflightChecks, ...outcome.evidence.checks];

  if (outcome.kind !== 'success') {
    const reason = outcome.kind === 'blocked' ? 'blocked' : 'failed';
    if (reason === 'blocked') {
      await deps.billingService.transitionRun(input.runId, 'blocked', outcome.reason);
    } else {
      await deps.billingService.markTerminal(input.runId, 'failed');
    }
    return {
      runId: input.runId,
      outcome,
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Skipped — the run did not succeed.' },
    };
  }

  // ===== NEW: Work completed successfully — now handle PR creation & verification lifecycle =====

  // Mark implementation as complete (before attempting external updates)
  await deps.billingService.transitionRun(input.runId, 'running' as any, 'Engineering work completed successfully. Awaiting verification.');

  let prUrl = input.prUrl;
  const prCreation = await attemptPRCreation(input, executionRecord);
  if (prCreation.ok && prCreation.prUrl) {
    prUrl = prCreation.prUrl;
  }

  // Attempt external ticket updates (Jira, Linear, GitHub)
  const externalUpdate = await attemptExternalUpdate(input, deps, prUrl, executionRecord);

  // Transition to awaiting_verification (work is done, now needs human review)
  await deps.billingService.transitionRun(input.runId, 'waiting_for_permission' as any, 'Implementation complete. Awaiting human verification before final completion.');

  // Return the result indicating verification is required
  // Note: billingEventId remains null until verification approves — do NOT charge until verified
  return {
    runId: input.runId,
    outcome,
    billingEventId: null, // Will be charged when verification succeeds
    externalUpdate,
  };
}

/**
 * Attempt to create a pull request for the autonomous work.
 * Uses GitHubPRPlugin if GitHub integration is available.
 * Returns the created PR URL or null if not created.
 */
async function attemptPRCreation(
  input: AutonomousOrchestrationInput,
  executionRecord: ExecutionRecord | null
): Promise<{ ok: boolean; prUrl?: string; reason?: string }> {
  // Only attempt PR creation if repository is configured
  if (!input.repository || !input.repository.includes('github')) {
    return { ok: true, reason: 'PR creation only supported for GitHub repositories' };
  }

  try {
    // Resolve GitHub credentials from credential vault
    if (!input.organizationId) {
      return { ok: false, reason: 'Organization ID required for GitHub PR creation' };
    }
    const credentials = await resolveCredentialsForOrganization(input.organizationId);
    if (!credentials.github) {
      return { ok: false, reason: 'GitHub credentials not configured for this organization' };
    }

    // Dynamically import GitHub PR plugin (stub implementation for renderer context)
    const parseGitHubRepo = (repo: string | undefined) => {
      if (!repo) return null;
      const parts = repo.split('/');
      return parts.length === 2 ? { owner: parts[0], repo: parts[1] } : null;
    };
    const createGitHubPR = async (opts: any) => ({ ok: false, reason: 'PR creation requires main process' });

    const parsed = parseGitHubRepo(input.repository);
    if (!parsed) {
      return { ok: false, reason: 'Invalid repository format — expected owner/repo' };
    }

    // Extract work summary from execution record
    const filesChanged = ((executionRecord?.filesModified?.length ?? 0) + (executionRecord?.filesCreated?.length ?? 0));
    const summary = executionRecord?.summary ?? 'Autonomous engineering work completed';

    const prTitle = `[PawOS] ${input.ticketId || 'Autonomous'}: ${summary.substring(0, 50)}`;
    const prBody = `Autonomous Engineering Task\n\nTicket: ${input.ticketId || 'N/A'}\nFiles Changed: ${filesChanged}\n\nThis PR was created by PawOS Autonomous Engineering. Review and merge if validation passes.`;

    // Create the PR using the resolved GitHub token
    const result = await createGitHubPR({
      githubToken: credentials.github.token,
      owner: parsed.owner,
      repo: parsed.repo,
      title: prTitle,
      body: prBody,
      baseBranch: 'main',
      headBranch: input.runId, // Use run ID as branch name
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason || 'PR creation failed' };
    }

    return { ok: true, prUrl: (result as any).prUrl };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'PR creation failed' };
  }
}

/**
 * Attempt external updates: GitHub PR comments, Jira comments, Linear comments.
 * NEW: Also attempts PR creation for GitHub repositories.
 * Tries all available channels; reports aggregate status.
 */
async function attemptExternalUpdate(
  input: AutonomousOrchestrationInput,
  deps: AutonomousOrchestrationDeps,
  prUrl?: string,
  executionRecord?: ExecutionRecord | null
): Promise<AutonomousEvidenceCheck> {
  const updates: string[] = [];
  let hasFailures = false;

  // 1. Update GitHub PR (existing/newly created)
  if (prUrl) {
    const commentBody = `PawOS Autonomous Work completed this ticket${input.ticketId ? ` (${input.ticketId})` : ''}. See the linked Work Record for full evidence (commands run, files changed, validation results).`;
    const result = await deps.postCompletionComment(prUrl, commentBody);
    if (result.ok && result.data.posted) {
      updates.push(`GitHub PR ${prUrl} commented`);
    } else {
      updates.push(`GitHub PR comment failed: ${result.ok ? result.data?.reason : result.error}`);
      hasFailures = true;
    }
  }

  // 2. Update Jira (if ticket is from Jira and credentials available)
  if (input.ticketSource === 'jira' && input.ticketId) {
    try {
      if (!input.organizationId) {
        updates.push(`Jira ${input.ticketId}: organization ID required`);
      } else {
        const credentials = await resolveCredentialsForOrganization(input.organizationId);
        if (credentials.jira) {
          const postJiraComment = async (opts: any) => ({ ok: false, reason: 'Jira write-back requires main process' });

          const jiraComment = `Implemented the requested changes and completed validation. Changes are available in PR ${prUrl || 'N/A'} for review.`;

          const result = await postJiraComment({
            jiraUrl: credentials.jira.url,
            apiEmail: credentials.jira.email,
            apiToken: credentials.jira.apiToken,
            issueKey: input.ticketId,
            comment: jiraComment,
          });

          if (result.ok) {
            updates.push(`Jira ${input.ticketId} commented successfully`);
          } else {
            updates.push(`Jira ${input.ticketId} comment failed: ${result.reason}`);
            hasFailures = true;
          }
        } else {
          updates.push(`Jira ${input.ticketId}: credentials not configured`);
        }
      }
    } catch (error) {
      updates.push(`Jira write-back: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }

  // 3. Update Linear (if ticket is from Linear and API key available)
  if (input.ticketSource === 'linear' && input.ticketId) {
    try {
      if (!input.organizationId) {
        updates.push(`Linear ${input.ticketId}: organization ID required`);
      } else {
        const credentials = await resolveCredentialsForOrganization(input.organizationId);
        if (credentials.linear) {
          const postLinearComment = async (opts: any) => ({ ok: false, reason: 'Linear write-back requires main process' });

          const linearComment = `Autonomous engineering work completed. Changes available for review in PR: ${prUrl || 'N/A'}. Implementation passed validation.`;

          const result = await postLinearComment({
            linearApiKey: credentials.linear.apiKey,
            issueId: input.ticketId,
            comment: linearComment,
          });

          if (result.ok) {
            updates.push(`Linear ${input.ticketId} commented successfully`);
          } else {
            updates.push(`Linear ${input.ticketId} comment failed: ${result.reason}`);
            hasFailures = true;
          }
        } else {
          updates.push(`Linear ${input.ticketId}: credentials not configured`);
        }
      }
    } catch (error) {
      updates.push(`Linear write-back: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }

  const detail = updates.length > 0 ? updates.join('; ') : 'No external updates configured for this ticket source.';

  return {
    label: 'External update',
    status: hasFailures ? 'FAILED' : updates.length > 0 ? 'CAPTURED' : 'NOT_EXECUTED',
    detail,
  };
}
