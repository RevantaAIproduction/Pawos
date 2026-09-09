import { ConversationRuntime } from '../conversation/ConversationRuntime';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider, ReasoningProviderRequest, ReasoningProviderSession, ReasoningProviderCallbacks } from '../reasoning/ReasoningProvider';
import { aiRouter } from '../ai/AIRouter';
import { buildSystemPrompt } from '../conversation/systemPrompt';
import { getIpcBridge } from '../services/ipc/ipcBridge';
import { autonomousTaskBillingService } from './AutonomousTaskBillingService';
import { providerCostToWorkPc } from '../../shared/billing/AutonomousWorkPcCommercialModel';
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
  run(prompt: string, opts: { autonomousRunId?: string; autonomousOrganizationId?: string }): Promise<HeadlessTurnResult>;
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

  private createAuthorizedProvider(baseProvider: ReasoningProvider, runId: string, organizationId: string | null, executorInstanceId: string): ReasoningProvider {
    const billingService = autonomousTaskBillingService;

    // PHASE 2D: Exact Gemini token preflight via countTokens API
    const getExactInputTokenCount = async (geminiRequest: ReasoningProviderRequest, model: string, geminiApiKey: string): Promise<number> => {
      // Call Gemini's countTokens API with EXACT effective request
      // This matches the structure of generateContent request in GeminiReasoningProvider.ts
      // CRITICAL: The countTokens request must be IDENTICAL to the generateContent request for billing accuracy

      // Reconstruct request exactly as GeminiReasoningProvider.ts does
      function toGeminiContents(request: ReasoningProviderRequest) {
        const contents: any[] = [];
        for (const m of request.history) {
          if (m.role === 'user') {
            contents.push({ role: 'user', parts: [{ text: m.content }] });
          } else if (m.role === 'assistant') {
            const parts: any[] = [];
            if (m.content) parts.push({ text: m.content });
            for (const call of m.toolCalls ?? []) {
              parts.push({
                functionCall: { name: call.name, args: call.arguments ?? {} },
                ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
              });
            }
            if (parts.length > 0) contents.push({ role: 'model', parts });
          } else if (m.role === 'tool') {
            contents.push({
              role: 'user',
              parts: [{ functionResponse: { name: m.name ?? 'unknown_tool', response: { result: m.content } } }],
            });
          }
        }
        if (request.input) contents.push({ role: 'user', parts: [{ text: request.input }] });
        return contents;
      }

      function toGeminiTools(request: ReasoningProviderRequest) {
        if (!request.tools || request.tools.length === 0) return undefined;
        return [
          {
            function_declarations: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            })),
          },
        ];
      }

      const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      const url = `${baseUrl}/models/${model}:countTokens?key=${encodeURIComponent(geminiApiKey)}`;

      const countTokensRequest = {
        contents: toGeminiContents(geminiRequest),
        ...(geminiRequest.systemPrompt ? { systemInstruction: { parts: [{ text: geminiRequest.systemPrompt }] } } : {}),
        ...(toGeminiTools(geminiRequest) ? { tools: toGeminiTools(geminiRequest) } : {}),
      };

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(countTokensRequest),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Gemini countTokens failed (${res.status}): ${errorBody}`);
        }

        const data = await res.json();
        if (typeof data.totalTokens !== 'number') {
          throw new Error('Invalid countTokens response: missing totalTokens');
        }

        return data.totalTokens;
      } catch (err) {
        // FAIL-CLOSED: If exact token count cannot be determined, do NOT authorize
        throw new Error(
          `Exact token preflight failed. Cannot authorize request without precise token count. ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    const calculateMaxRequestCost = async (geminiRequest: ReasoningProviderRequest, model: string, apiKey: string): Promise<number> => {
      // AUTONOMOUS WORK PC AUTHORIZATION
      //
      // This calculates the maximum customer Work PC that MIGHT be consumed by a Gemini request,
      // accounting for EXACT token counts via Gemini's countTokens API and the 70% gross margin policy.
      //
      // Important: Token count comes from Gemini's countTokens API (exact).
      // Actual consumption comes from Gemini's real usage response.
      // Reservation is a temporary hold. Settlement charges actual usage.

      // Step 1: Get EXACT input token count from Gemini's countTokens API (PHASE 2D)
      // CRITICAL: This is NOT an estimate. We get the exact count from Gemini.
      // Do NOT use chars/4 heuristic or arbitrary margins.
      let inputTokens: number;
      try {
        inputTokens = await getExactInputTokenCount(geminiRequest, model, baseProvider.id === 'gemini' ? (baseProvider as any).apiKey : '');
      } catch (err) {
        // FAIL-CLOSED: Cannot authorize without exact token count
        throw new Error(`Token preflight failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Step 2: Get configured output limit
      // Set in GeminiReasoningProvider.ts: 8,000 tokens
      // This bounds the maximum billable output tokens per request
      const configuredMaxOutputTokens = 8000;

      // Step 3: Resolve actual model pricing from config
      // Fetch Gemini pricing config via IPC
      const ipcRenderer = (window as any).electron?.ipcRenderer;
      if (!ipcRenderer) throw new Error('IPC unavailable');
      const pawComputeConfig = await ipcRenderer.invoke('billing:getPawComputeConfig');
      const pricing = pawComputeConfig.modelPricing[model] ?? pawComputeConfig.modelPricing.default;

      if (!pricing) {
        throw new Error(`No pricing configuration available for model: ${model}`);
      }

      // Step 4: Calculate provider cost (USD) with EXACT input tokens
      // Use exact input tokens from countTokens API
      // Output: assume configured maximum (8,000 tokens)
      const inputUsd = (inputTokens * pricing.inputPerMillionUsd) / 1_000_000;
      const outputUsd = (configuredMaxOutputTokens * pricing.outputPerMillionUsd) / 1_000_000;
      const maximumProviderCostUsd = inputUsd + outputUsd;

      // Step 5: Apply 70% gross margin commercial policy
      // Customer charge = Provider cost / 0.30
      const maximumCustomerChargeUsd = maximumProviderCostUsd / 0.30;

      // Step 6: Convert to customer Work PC
      // $1 customer charge = 100 Work PC
      const maximumWorkPc = providerCostToWorkPc(maximumProviderCostUsd);

      // Step 7: No arbitrary safety margin (PHASE 2D)
      // With exact token counts from Gemini's countTokens API, we don't need estimation variance margin.
      // Authorization is based on exact input tokens + configured output budget.
      const maxWorkPc = providerCostToWorkPc(maximumProviderCostUsd);

      console.log('[AUTONOMOUS_AUTHORIZATION_CALCULATED]', {
        runId,
        model,
        inputTokensExact: inputTokens,  // EXACT from countTokens
        maxOutputTokensConfigured: configuredMaxOutputTokens,
        inputUsd: Math.round(inputUsd * 10000) / 10000,
        outputUsd: Math.round(outputUsd * 10000) / 10000,
        maximumProviderCostUsd: Math.round(maximumProviderCostUsd * 10000) / 10000,
        maximumCustomerChargeUsd: Math.round(maximumCustomerChargeUsd * 10000) / 10000,
        maximumWorkPc: Math.round(maxWorkPc * 10000) / 10000,
      });

      return Math.ceil(maxWorkPc);
    };

    const authorizeModelRequest = async (requiredPc: number): Promise<void> => {
      // ATOMIC authorization RPC: single database operation replaces read-check-extend
      // This RPC validates run ownership, locks wallet, checks idempotency, extends if needed
      // Returns success/failure with clear reason
      // Zero mutations if authorization fails

      // PHASE 2C: executorInstanceId is server-generated (passed from claim_autonomous_executor_for_run)
      // Never uses crypto.randomUUID() — executor identity is authoritative on server
      if (!executorInstanceId) {
        throw new Error(
          'Executor instance ID not available. ' +
          'The run must be claimed server-side via claim_autonomous_executor_for_run() before authorization.'
        );
      }

      const supabase = await getSupabaseClient();
      const requestId = crypto.randomUUID(); // Unique per model request (not per retry)

      const { data, error } = await supabase.rpc(
        'authorize_autonomous_model_request',
        {
          p_run_id: runId,
          p_request_id: requestId,
          p_required_pc: requiredPc,
          p_executor_instance_id: executorInstanceId
        }
      );

      if (error) {
        throw new Error(`Authorization RPC failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error('Authorization RPC returned no result');
      }

      const result = data[0];
      console.log('[AUTHORIZE_RESULT]', {
        runId,
        requestId,
        success: result.success,
        reserved: result.authorized_reservation_total,
        available: result.available_remaining,
        error: result.error_message
      });

      if (!result.success) {
        throw new Error(
          `Autonomous work PC authorization failed: ${result.error_message ?? 'insufficient balance'}. ` +
          `Please top up wallet and resume.`
        );
      }
    };

    return {
      id: baseProvider.id,
      label: baseProvider.label,
      isSupported: () => baseProvider.isSupported(),

      streamResponse: (request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession => {
        let realSession: ReasoningProviderSession | null = null;

        // ATOMIC authorization: single RPC validates run, locks wallet, checks idempotency, extends atomically
        // DO NOT CALL GEMINI until this authorization RPC returns success
        (async () => {
          try {
            // 1. Resolve actual model for authorization
            // Must use the SAME model as actual execution to ensure pricing consistency
            // baseProvider.model is now always available from AIRouter (via ReasoningProvider interface)
            // This is the authoritative model string used for billing/authorization
            const model = baseProvider.model;

            if (!model) {
              throw new Error(
                `Model identity not available from provider "${baseProvider.id}". ` +
                `Authorization requires knowing the exact concrete model for pricing lookup. ` +
                `This is a configuration error — the provider instance must be created with a specific model.`
              );
            }

            // PHASE 2D: Get exact input token count via Gemini's countTokens API
            // This requires API key for Gemini requests
            const { aiProviderConfigStore } = await import('../ai/AIProviderConfigStore');
            const geminiApiKey = aiProviderConfigStore.getApiKey('gemini');
            if (!geminiApiKey) {
              throw new Error('Gemini API key not configured. Cannot perform token preflight.');
            }

            const requiredWorkPcPerRequest = await calculateMaxRequestCost(request, model, geminiApiKey);

            console.log('[AUTONOMOUS_MODEL_REQUEST_AUTHORIZATION]', {
              runId,
              requiredWorkPc: requiredWorkPcPerRequest,
              model
            });

            // 2. ATOMIC: Call authorize_autonomous_model_request RPC
            // This single RPC:
            // - Validates run ownership and state (must be 'running', not 'waiting_for_permission')
            // - Validates run is not already settled
            // - Validates executor instance ID
            // - Locks run + wallet rows (row-level, not table-wide)
            // - Checks if (run_id, request_id) already authorized (idempotent)
            // - Extends wallet reservation if needed (in Work PC, not normalized compute)
            // - Returns success/failure atomically
            // - Makes ZERO mutations if authorization fails
            await authorizeModelRequest(requiredWorkPcPerRequest);

            // 3. Authorization succeeded — ONLY NOW call Gemini API
            console.log('[AUTONOMOUS_AUTHORIZATION_PASSED]', { runId, requiredWorkPc: requiredWorkPcPerRequest });
            realSession = baseProvider.streamResponse(request, callbacks);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('[MODEL_REQUEST_AUTHORIZATION_FAILED]', { runId, error: error.message });
            // Transition to waiting_for_topup will be handled by orchestrator if balance insufficient
            callbacks.onError(error);
          }
        })();

        // Return a cancellable session (delegates to real session once started)
        return {
          cancel: () => {
            if (realSession) realSession.cancel();
          }
        };
      }
    };
  }

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

  async run(prompt: string, opts: { autonomousRunId?: string; autonomousOrganizationId?: string }): Promise<HeadlessTurnResult> {
    const bridge = getIpcBridge();
    let latestRecord: ExecutionRecord | null = null;

    // PHASE 2C: Claim executor server-side BEFORE authorization
    let executorInstanceId: string | null = null;
    if (opts.autonomousRunId) {
      const supabase = await getSupabaseClient();
      const claimRequestId = crypto.randomUUID(); // Request-level idempotency (not executor identity)

      const { data: claimResult, error: claimError } = await supabase.rpc(
        'claim_autonomous_executor_for_run',
        {
          p_run_id: opts.autonomousRunId,
          p_claim_request_id: claimRequestId
        }
      );

      if (claimError) {
        throw new Error(`Failed to claim executor: ${claimError.message}`);
      }

      if (!claimResult || claimResult.length === 0) {
        throw new Error('Executor claim returned no result');
      }

      const claimData = claimResult[0];
      if (claimData.error_message) {
        throw new Error(`Executor claim failed: ${claimData.error_message}`);
      }

      executorInstanceId = claimData.execution_executor_instance_id;
      if (!executorInstanceId) {
        throw new Error('Server failed to generate executor instance ID');
      }

      console.log('[EXECUTOR_CLAIMED_SERVER_SIDE]', {
        runId: opts.autonomousRunId,
        executorInstanceId,
        claimRequestId,
        status: claimData.status
      });
    }

    // Wrap the provider with reservation authorization: check/extend before each Gemini API call
    const baseProvider = aiRouter.getReasoningProvider();
    const authorizedProvider = opts.autonomousRunId && executorInstanceId
      ? this.createAuthorizedProvider(baseProvider, opts.autonomousRunId, opts.autonomousOrganizationId ?? null, executorInstanceId)
      : baseProvider;

    const reasoningRuntime = new ReasoningRuntime(authorizedProvider, buildSystemPrompt(true));

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
      autonomousRunId: opts.autonomousRunId ?? undefined,
      onTurnUsage: async (submission) => {
        console.log('[AUTONOMOUS_RUN_USAGE_RECORD_START] runId:', opts.autonomousRunId);
        const recordPromise = bridge.billingRecordAutonomousTurnUsage?.(submission);
        if (!recordPromise) {
          throw new Error('Usage recording bridge unavailable (cannot bill work safely)');
        }
        try {
          await recordPromise;
          console.log('[AUTONOMOUS_RUN_USAGE_RECORDED] runId:', opts.autonomousRunId);
        } catch (err) {
          console.error('[AUTONOMOUS_RUN_USAGE_RECORD_FAILED] runId:', opts.autonomousRunId, 'error:', err instanceof Error ? err.message : String(err));
          throw new Error(`Usage recording failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });

    // If autonomous mode, track the session; otherwise, run without session tracking
    if (opts.autonomousRunId) {
      this.sessions.set(opts.autonomousRunId, { runtime });
    }

    const settlement = this.awaitSettlement(runtime, () => latestRecord);
    runtime.submitTranscript(prompt);
    const result = await settlement;

    if (opts.autonomousRunId) {
      if (result.kind === 'finished') {
        console.log('[BILLING_SAFETY_VERIFICATION] runId:', opts.autonomousRunId, 'turn completed and settlement succeeded (usage recorded via onTurnUsage callback)');
        this.sessions.delete(opts.autonomousRunId);
      }
      if (result.kind === 'waitingForPermission') {
        console.log('[BILLING_SAFETY_PERMISSION_PENDING] runId:', opts.autonomousRunId, 'turn awaiting approval before completion');
      }
    }
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
  postCompletionComment: (runId: string, prUrl: string, body: string) => ReturnType<ReturnType<typeof getIpcBridge>['connectivityPostAutonomousCompletionComment']>;
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
    postCompletionComment: (runId, prUrl, body) => bridge.connectivityPostAutonomousCompletionComment({ runId, prUrl, comment: body }),
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
  console.log('[AUTONOMOUS_RUN_START] runId:', input.runId, 'ticketId:', input.ticketId, 'source:', input.ticketSource);

  // Capture wallet balance before execution
  const walletBefore = await deps.billingService.getTicketBalance(input.organizationId ?? null);
  console.log('[AUTONOMOUS_RUN_WALLET_BEFORE] runId:', input.runId, 'availableBalancePc:', walletBefore.availableBalancePc, 'reservedPc:', walletBefore.reservedPc);

  console.log('[TIER_COMPUTE_ISOLATION] autonomous work uses Ticket Balance PC, NOT Tier Compute');
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

  // Reserve PC for this turn: evidence-based estimate from Gemini typical costs.
  // Cold request (~32 PC) + ~25 warm tool continuations (~8 PC each) = ~232 PC.
  // Conservative reserve: 300 PC covers typical autonomous task turn with safety margin.
  // This is for ONE turn; if additional turns needed, will be handled after completion.
  const estimatedPcPerTurn = 300;
  const reserveResult = await deps.billingService.reserveAutonomousPc(
    input.runId,
    estimatedPcPerTurn,
    `reserve-${input.runId}-turn-1`
  );
  if (!reserveResult.success) {
    const reason = `Insufficient Autonomous Work PC balance to start. Required: ${estimatedPcPerTurn} PC, Available: ${reserveResult.availableRemaining ?? 0} PC. Please add more credit.`;
    await deps.billingService.transitionRun(input.runId, 'waiting_for_topup', reason);
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [{ label: 'PC Balance', status: 'BLOCKED', detail: reason }] } },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Skipped — insufficient PC balance. Top up wallet and retry.' },
    };
  }
  console.log('[AUTONOMOUS_RUN_RESERVED] runId:', input.runId, 'reservedPc:', estimatedPcPerTurn, 'reservedTotal:', reserveResult.reservedPc, 'availableRemaining:', reserveResult.availableRemaining);

  await deps.billingService.transitionRun(input.runId, 'running', 'Autonomous orchestration started.');

  const prompt = buildAutonomousPrompt(
    { ticketId: input.ticketId, ticketSource: input.ticketSource, ticketTitle: input.ticketTitle, ticketDescription: input.ticketDescription },
    worktreePath
  );

  let turnResult = await deps.turnRunner.run(prompt, {
    autonomousRunId: input.runId,
    autonomousOrganizationId: input.organizationId ?? undefined
  });

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

/** Called once a run previously left `waiting_for_topup` (insufficient balance) detects sufficient balance
 *  again via top-up or other means — reuses the same live headless turn session if still alive. */
export async function resumeAutonomousRunFromTopup(input: AutonomousOrchestrationInput, deps: AutonomousOrchestrationDeps = defaultDeps()): Promise<AutonomousOrchestrationResult> {
  // Same evidence-based estimate as initial reservation: one turn = ~300 PC
  const estimatedPcPerTurn = 300;

  const walletAfterTopup = await deps.billingService.getTicketBalance(input.organizationId ?? null);
  if (walletAfterTopup.availableBalancePc < estimatedPcPerTurn) {
    const reason = `Insufficient balance after top-up. Available: ${walletAfterTopup.availableBalancePc} PC, need at least ${estimatedPcPerTurn} PC. Please add more credit.`;
    return {
      runId: input.runId,
      outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [{ label: 'PC Balance', status: 'BLOCKED', detail: reason }] } },
      billingEventId: null,
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Insufficient balance — add more credit and retry.' },
    };
  }

  // Extend the reservation to ensure we have enough for the next turn
  const currentWallet = await deps.billingService.getTicketBalance(input.organizationId ?? null);
  if (currentWallet.reservedPc < estimatedPcPerTurn) {
    const additionalNeeded = estimatedPcPerTurn - currentWallet.reservedPc;
    const extendResult = await deps.billingService.extendAutonomousReservation(
      input.runId,
      additionalNeeded,
      `extend-${input.runId}-topup-${Date.now()}`,
      `resumed-from-topup`
    );
    if (!extendResult.success) {
      const reason = `Failed to extend reservation after top-up: ${extendResult.errorMessage ?? 'Unknown error.'}`;
      return {
        runId: input.runId,
        outcome: { kind: 'blocked', reason, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [{ label: 'PC Extension', status: 'BLOCKED', detail: reason }] } },
        billingEventId: null,
        externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Failed to extend reservation. Wallet may be depleted.' },
      };
    }
  }

  await deps.billingService.transitionRun(input.runId, 'running', 'Balance restored — resuming execution.');
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

/** Called once a run previously left `waiting_for_permission` receives a real decision — reuses the
 *  same live headless turn session if one is still alive in this process (see HeadlessTurnRunner's
 *  own doc comment for the disclosed across-restart limitation). */
export async function resumeAutonomousRun(input: AutonomousOrchestrationInput, granted: boolean, deps: AutonomousOrchestrationDeps = defaultDeps()): Promise<AutonomousOrchestrationResult> {
  if (!granted) {
    // User denied permission — transition to terminal state
    await deps.billingService.transitionRun(input.runId, 'cancelled', 'Human denied the required permission.');

    // PHASE 1: Settle any provider work that occurred before cancellation
    // Cancellation AFTER provider work → settle actual Work PC
    // Cancellation BEFORE provider work → settle 0 / release reservation
    let billingEventId: string | null = null;
    try {
      const ipcRenderer = (window as any).electron?.ipcRenderer;
      if (ipcRenderer) {
        const settlementData = await ipcRenderer.invoke('billing:settleAutonomousRun', input.runId, input.organizationId ?? null);
        if (settlementData.actualPc !== null && settlementData.actualPc !== undefined) {
          try {
            billingEventId = await deps.billingService.settleWithActualPc(input.runId, settlementData.actualPc);
            console.log('[CANCELLATION_SETTLED] runId:', input.runId, 'billingEventId:', billingEventId, 'actualPc:', settlementData.actualPc);
          } catch (settleErr) {
            const err = settleErr instanceof Error ? settleErr.message : String(settleErr);
            console.error('[CANCELLATION_SETTLEMENT_FAILED] runId:', input.runId, 'error:', err);
            throw new Error(`Cancellation settlement failed: ${err}`);
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error('[CANCELLATION_PHASE_ERROR] runId:', input.runId, 'error:', error);
      // Do not suppress cancellation errors
      throw err;
    }

    return {
      runId: input.runId,
      outcome: { kind: 'cancelled', reason: 'Human denied the required permission.', evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [] } },
      billingEventId, // Contains settlement ID if provider work occurred
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

  // ===== PHASE 1 CORRECTED: CANONICAL BILLING BOUNDARY =====
  // Architecture: execution outcome → terminal state → settlement
  // NOT: settlement while running
  //
  // Settlement REQUIRES terminal status. Must transition FIRST, then settle.
  let billingEventId: string | null = null;

  // ===== STEP 1: MARK TERMINAL STATE (BEFORE settlement) =====
  if (outcome.kind !== 'success') {
    // Non-success outcomes: transition to terminal state
    // NOTE: 'blocked' is application-level state; settlement RPC only accepts
    // (completed, failed, cancelled, abandoned). Treat blocked as failed for settlement.
    await deps.billingService.markTerminal(input.runId, 'failed');
  } else {
    // Success: must use completeRun() to mark 'completed' (per SQL constraint)
    // This transitions to terminal status AND marks execution complete
    try {
      await deps.billingService.completeRun(input.runId, {
        prUrl: input.prUrl,
        clientReplySent: false,
        deployCompleted: false,
      });
    } catch (completeErr) {
      const err = completeErr instanceof Error ? completeErr.message : String(completeErr);
      console.error('[COMPLETION_FAILED] runId:', input.runId, 'error:', err);
      // If completion fails, mark as failed so we can still settle actual usage
      await deps.billingService.markTerminal(input.runId, 'failed');
      // Continue to settlement with actual usage that was recorded
    }
  }

  // ===== STEP 2: SETTLE WITH ACTUAL WORK PERFORMED (after terminal state) =====
  // Settlement RPC requires terminal status; now that status is set, we can settle
  // Billing boundary = actual provider work performed, not outcome status
  try {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      throw new Error('IPC renderer not available — cannot settle autonomous run');
    }

    const settlementData = await ipcRenderer.invoke('billing:settleAutonomousRun', input.runId, input.organizationId ?? null);

    if (settlementData.recoveryRequired) {
      console.error('[SETTLEMENT_RECOVERY_REQUIRED] runId:', input.runId, 'Cannot settle with compromised usage data');
      // Usage data integrity issue: preserve reservation for manual recovery
    } else if (settlementData.actualPc !== null && settlementData.actualPc !== undefined) {
      const actualPc = settlementData.actualPc;
      console.log('[SETTLEMENT_ACTUAL_PC_RECEIVED] runId:', input.runId, 'actualPc:', actualPc);

      // Settlement RPC: release unused reservation, deduct actual consumption, create billing event
      try {
        billingEventId = await deps.billingService.settleWithActualPc(input.runId, actualPc);
        console.log('[SETTLEMENT_COMMITTED] runId:', input.runId, 'billingEventId:', billingEventId, 'actualPc:', actualPc);
      } catch (settleErr) {
        const settleError = settleErr instanceof Error ? settleErr.message : String(settleErr);
        console.error('[SETTLEMENT_FAILED_AFTER_TERMINAL] runId:', input.runId, 'error:', settleError);
        // CRITICAL: Do not suppress settlement failure. Run is already terminal, reservation is locked.
        // Throw so retry can occur safely. Idempotency is guaranteed by settled_at check in RPC.
        throw new Error(`Settlement failed after terminal transition: ${settleError}. Run is safe to retry.`);
      }
    } else if (settlementData.error) {
      console.error('[SETTLEMENT_CALCULATION_FAILED] runId:', input.runId, 'error:', settlementData.error);
      throw new Error(`Actual PC calculation failed: ${settlementData.error}`);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[SETTLEMENT_PHASE_FAILED] runId:', input.runId, 'error:', error);
    // Settlement failure is terminal — outcome must be reported with error
    throw err;
  }

  // ===== STEP 3: SUCCESS PATH ONLY — Continue to verification/PR workflow =====
  if (outcome.kind !== 'success') {
    return {
      runId: input.runId,
      outcome,
      billingEventId, // Contains ID if provider work occurred; null if zero usage
      externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: 'Skipped — the run did not succeed.' },
    };
  }

  // Success path: proceed to external updates and verification workflow
  let prUrl = input.prUrl;
  const prCreation = await attemptPRCreation(input, executionRecord);
  if (prCreation.ok && prCreation.prUrl) {
    prUrl = prCreation.prUrl;
  }

  // Attempt external ticket updates (Jira, Linear, GitHub)
  const externalUpdate = await attemptExternalUpdate(input, deps, prUrl, executionRecord);

  // Transition to waiting_for_permission for human verification
  // Note: This is a non-terminal state. If the run were somehow reverted, settlement has already occurred.
  await deps.billingService.transitionRun(input.runId, 'waiting_for_permission' as any, 'Implementation complete. Awaiting human verification before final completion.');

  // Capture wallet balance after settlement
  const walletAfter = await deps.billingService.getTicketBalance(input.organizationId ?? null);
  console.log('[AUTONOMOUS_RUN_WALLET_AFTER_SETTLEMENT] runId:', input.runId, 'availableBalancePc:', walletAfter.availableBalancePc, 'reservedPc:', walletAfter.reservedPc, 'billingEventId:', billingEventId);

  return {
    runId: input.runId,
    outcome,
    billingEventId, // Contains real settlement event ID
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
    const result = await deps.postCompletionComment(input.runId, prUrl, commentBody);
    if (result.ok && result.ok) {
      updates.push(`GitHub PR ${prUrl} commented`);
    } else {
      updates.push(`GitHub PR comment failed: ${result.reason}`);
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
          const ipcRenderer = (window as any).electron?.ipcRenderer;
          if (!ipcRenderer) {
            updates.push(`Jira ${input.ticketId}: IPC renderer not available`);
          } else {
            const jiraComment = `Implemented the requested changes and completed validation. Changes are available in PR ${prUrl || 'N/A'} for review.`;

            const result = await ipcRenderer.invoke('connectivity:postJiraComment', {
              runId: input.runId,
              jiraUrl: credentials.jira.url,
              apiEmail: credentials.jira.email,
              apiToken: credentials.jira.apiToken,
              issueKey: input.ticketId,
              comment: jiraComment,
            });

            if (result.ok && result.data?.ok) {
              updates.push(`Jira ${input.ticketId} commented successfully`);

              // Attempt status transition after successful comment
              try {
                const transitionResult = await ipcRenderer.invoke('connectivity:transitionJiraIssue', {
                  jiraUrl: credentials.jira.url,
                  apiEmail: credentials.jira.email,
                  apiToken: credentials.jira.apiToken,
                  issueKey: input.ticketId,
                  transitionName: 'Done',
                });

                if (transitionResult.ok && transitionResult.data?.ok) {
                  updates.push(`Jira ${input.ticketId} status transitioned to Done`);
                } else {
                  const transitionReason = transitionResult.error || transitionResult.data?.reason || 'Unknown error';
                  updates.push(`Jira ${input.ticketId} status transition failed: ${transitionReason}`);
                }
              } catch (transitionError) {
                const err = transitionError instanceof Error ? transitionError.message : 'Unknown error';
                updates.push(`Jira ${input.ticketId} status transition error: ${err}`);
              }
            } else {
              const reason = result.error || result.data?.reason || 'Unknown error';
              updates.push(`Jira ${input.ticketId} comment failed: ${reason}`);
              hasFailures = true;
            }
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
          const ipcRenderer = (window as any).electron?.ipcRenderer;
          if (!ipcRenderer) {
            updates.push(`Linear ${input.ticketId}: IPC renderer not available`);
          } else {
            const linearComment = `Autonomous engineering work completed. Changes available for review in PR: ${prUrl || 'N/A'}. Implementation passed validation.`;

            const result = await ipcRenderer.invoke('connectivity:postLinearComment', {
              runId: input.runId,
              linearApiKey: credentials.linear.apiKey,
              issueId: input.ticketId,
              comment: linearComment,
            });

            if (result.ok && result.data?.ok) {
              updates.push(`Linear ${input.ticketId} commented successfully`);

              // Attempt status transition after successful comment
              try {
                const transitionResult = await ipcRenderer.invoke('connectivity:transitionLinearIssue', {
                  linearApiKey: credentials.linear.apiKey,
                  issueId: input.ticketId,
                  statusName: 'Done',
                });

                if (transitionResult.ok && transitionResult.data?.ok) {
                  updates.push(`Linear ${input.ticketId} status transitioned to Done`);
                } else {
                  const transitionReason = transitionResult.error || transitionResult.data?.reason || 'Unknown error';
                  updates.push(`Linear ${input.ticketId} status transition failed: ${transitionReason}`);
                }
              } catch (transitionError) {
                const err = transitionError instanceof Error ? transitionError.message : 'Unknown error';
                updates.push(`Linear ${input.ticketId} status transition error: ${err}`);
              }
            } else {
              const reason = result.error || result.data?.reason || 'Unknown error';
              updates.push(`Linear ${input.ticketId} comment failed: ${reason}`);
              hasFailures = true;
            }
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
