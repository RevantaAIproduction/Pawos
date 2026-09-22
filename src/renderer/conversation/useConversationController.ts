// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationRuntime } from './ConversationRuntime';
import type { ConversationSnapshot } from './ConversationTypes';
import { createSttProvider, createTtsProvider, type TtsProviderConfig } from './SpeechProviderRegistry';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';
import { aiRouter } from '../ai/AIRouter';
import { aiProviderConfigStore } from '../ai/AIProviderConfigStore';
import { getDefaultModelForTier } from '../ai/ModelSelectionByTier';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import { withGovernanceGate } from '../organization/GovernanceGate';
import { withAutonomousTaskBilling } from '../organization/AutonomousTaskBillingGate';
import type { VisemeFrame } from './LipSyncTypes';
import type { SubmittedInputContext } from './ConversationTypes';
import { buildSystemPrompt, buildLanguageInstruction } from './systemPrompt';
import { DEFAULT_EXECUTION_MODE, buildPlanModeInstruction, type ConversationExecutionMode } from '../../shared/actions/ExecutionModeTypes';
import type { EntitlementSnapshot, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { DEFAULT_PAW_MODEL_ID, type PawModelId } from '../../shared/ai/PawModelTypes';
import { categorizeTurn } from '../../shared/billing/AiUsageCategories';
import { getToolDefinitionsForEntitlement } from '../ai/IntentRegistry';
import { organizationService } from '../organization/OrganizationService';
import { organizationUsageService } from '../billing/OrganizationUsageService';
import type { TurnUsageSubmission } from '../../shared/billing/UsageMeteringTypes';

export function useConversationController(args?: {
  onStateChange?: (state: ConversationSnapshot['state']) => void;
  onVisemeFrame?: (frame: VisemeFrame) => void;
}) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>({
    panelOpen: false,
    state: 'idle',
    messages: [],
    draftTranscript: '',
    errorMessage: null,
    supportsSpeechRecognition: false,
    supportsSpeechSynthesis: false,
    voiceOutputEnabled: false,
    speechPlaybackState: 'off',
    pendingConfirmation: false,
  });
  const [streamingPawCompute, setStreamingPawCompute] = useState(0);
  const [streamingElapsedSeconds, setStreamingElapsedSeconds] = useState(0);

  const runtimeRef = useRef<ConversationRuntime | null>(null);
  // The just-completed turn's real, aggregate Gemini usage — set synchronously by
  // ConversationRuntime's onTurnUsage callback, always right before it fires onStateChange('completed')
  // for the same turn (see ConversationRuntime.ts's drainPendingActionsAndFinalize). Never read except
  // inside that 'completed' branch below, so there is no risk of a stale value from a prior turn
  // leaking into a later one's charge.
  const lastTurnUsageRef = useRef<TurnUsageSubmission | null>(null);
  const onStateChangeRef = useRef(args?.onStateChange);
  onStateChangeRef.current = args?.onStateChange;
  const onVisemeFrameRef = useRef(args?.onVisemeFrame);
  onVisemeFrameRef.current = args?.onVisemeFrame;
  const ipc = useIpcBridge();

  // Entitlement/credit gate — Runtime -> Entitlement Service -> Available
  // Models -> Credits -> Execute. Checked before every submit so Paw Go (no
  // AI models) and an exhausted credit pool never reach the reasoning
  // provider at all; nothing here ever switches models automatically.
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [creditsNoticeTier, setCreditsNoticeTier] = useState<SubscriptionTierId | null>(null);
  const entitlementRef = useRef(entitlement);
  entitlementRef.current = entitlement;
  // Personality addendum (see CompanionProfileTypes.ts's buildPersonalityAddendum) — kept here
  // rather than composed by the caller, so it can never race with the entitlement-driven tier
  // modules below over who last called setReasoningSystemPrompt: both paths funnel through this
  // one ref + applySystemPrompt, so the base (tier-aware) prompt and the addendum always compose
  // together instead of one silently overwriting the other's contribution.
  const personalityAddendumRef = useRef('');
  // The user's selected spoken language (see LANGUAGES in Dashboard/languages.ts) — read once at
  // startup and again whenever ProfileMenu's language picker fires 'pawos-speech-language-changed'.
  // Feeds a system-prompt instruction (below) so replies actually come back in that language, not
  // just speech *recognition* — without this, selecting e.g. Telugu only changed what Paw could
  // transcribe, never what it replied in.
  const speechLanguageRef = useRef('en-US');

  // The composer's execution mode (Manual/Accept edits/Plan/Auto/Bypass permissions — see
  // ExecutionModeTypes.ts) — read fresh via a ref (never a stale closure) by ConversationRuntime on
  // every requires-confirmation result, so switching modes mid-conversation takes effect
  // immediately. React state exists alongside the ref purely so the composer UI can render the
  // current selection.
  const [executionMode, setExecutionModeState] = useState<ConversationExecutionMode>(DEFAULT_EXECUTION_MODE);
  const executionModeRef = useRef(executionMode);
  executionModeRef.current = executionMode;
  // Settings-only "Bypass permissions" toggle (default off) — fetched once below alongside the
  // existing speechLanguage settings read. Never re-derived from anything model-controllable.
  const [bypassPermissionsEnabled, setBypassPermissionsEnabledState] = useState(false);
  const bypassPermissionsEnabledRef = useRef(bypassPermissionsEnabled);
  bypassPermissionsEnabledRef.current = bypassPermissionsEnabled;

  // The composer's model picker — see PawModelTypes.ts/AIRouter.ts/AIProviderConfigStore.ts (the
  // real, existing, global, localStorage-persisted model-selection state; not new state invented
  // for this picker). Mirrored into React state purely so the composer re-renders when it changes
  // (e.g. from AISettingsPage, or the picker itself); aiProviderConfigStore stays the source of
  // truth and is what AIRouter.getReasoningProvider() actually reads on every turn.
  const [activePawModel, setActivePawModelState] = useState<PawModelId>(aiProviderConfigStore.getActivePawModel());
  // Read inside the long-lived runtime-construction effect below (onStateChange's closure), which
  // only re-runs on [ipc] — without this ref it would always see the activePawModel value from the
  // render that first mounted the effect, never a later model switch.
  const activePawModelRef = useRef(activePawModel);
  activePawModelRef.current = activePawModel;

  // Session management
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionPromptCount, setCurrentSessionPromptCount] = useState(0);
  const [sessionLimitModalOpen, setSessionLimitModalOpen] = useState(false);
  const [preservedPrompt, setPreservedPrompt] = useState<{ text: string; context?: SubmittedInputContext } | null>(null);
  const [activeSessionName, setActiveSessionName] = useState<string | null>(null);
  // For every model, the minimum tier that unlocks it — derived server-side from
  // EntitlementService's own TIER_ENTITLEMENTS (see entitlement:getModelTierRequirements), never a
  // second hardcoded gating table in the renderer. Static, account-independent; fetched once.
  const [modelTierRequirements, setModelTierRequirements] = useState<Partial<Record<PawModelId, SubscriptionTierId>>>({});

  const applySystemPrompt = useCallback((canExecute: boolean) => {
    const base = buildSystemPrompt(canExecute);
    const addendum = personalityAddendumRef.current;
    const languageInstruction = buildLanguageInstruction(speechLanguageRef.current);
    const planModeInstruction = executionModeRef.current === 'plan' ? buildPlanModeInstruction() : '';
    const combined = [base, addendum, languageInstruction, planModeInstruction].filter(Boolean).join('\n\n');
    runtimeRef.current?.setReasoningSystemPrompt(combined);
  }, []);

  /** Switches the composer's execution mode — see ExecutionModeTypes.ts. Re-applies the system
   *  prompt so Plan mode's instruction composes/decomposes immediately, matching the same
   *  ref+applySystemPrompt pattern setPersonalityAddendum already uses below. */
  const setExecutionMode = useCallback((mode: ConversationExecutionMode) => {
    executionModeRef.current = mode;
    setExecutionModeState(mode);
    const canExecute = entitlementRef.current?.features.includes('advancedRuntimes') ?? false;
    applySystemPrompt(canExecute);
  }, [applySystemPrompt]);

  /** Switches the composer's active Paw model — see the model-picker state block above. Entitlement-
   *  gated against the current account's real model list (never a second hardcoded table); silently
   *  no-ops for a model the account isn't entitled to rather than ever appearing to "succeed" in the
   *  UI. Delegates to aiRouter.setActivePawModel, which persists to aiProviderConfigStore and is what
   *  the existing aiProviderConfigStore.subscribe() callback above picks up to live-repoint the
   *  running runtime's reasoning provider — the same hot-swap path AISettingsPage already exercises. */
  const selectModel = useCallback((id: PawModelId) => {
    const current = entitlementRef.current;
    if (current && !current.models.includes(id)) return;
    aiRouter.setActivePawModel(id);
  }, []);

  const refreshEntitlement = useCallback(() => {
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
  }, [ipc]);

  useEffect(() => {
    refreshEntitlement();
  }, [refreshEntitlement]);

  // Static, account-independent config — fetched once, not re-fetched on every entitlement refresh.
  useEffect(() => {
    ipc.entitlementGetModelTierRequirements().then(setModelTierRequirements).catch(() => {});
  }, [ipc]);

  // Real-time entitlement updates: refresh every 3 seconds while panel is open to show live usage
  useEffect(() => {
    const interval = setInterval(() => {
      refreshEntitlement();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshEntitlement]);

  // Resolved once per session, not re-fetched on every entitlement refresh — organization
  // membership doesn't change mid-session in practice, matching the same session-scoped resolution
  // convention already used elsewhere (useOrganizationTierSync, useConnectivityBootstrap). Only
  // meaningful for a pooled (Enterprise) account; null for every other tier and for a guest.
  const organizationIdRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    organizationService
      .getMyOrganizations()
      .then((orgs) => {
        if (!cancelled) organizationIdRef.current = orgs[0]?.id ?? null;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-filters the model's tool list the moment a real entitlement snapshot loads (or changes,
  // e.g. right after an upgrade) — Execute-class tools are withdrawn/restored without recreating
  // the whole runtime, same live-repoint pattern as setReasoningProvider below. Nothing filters yet
  // while entitlement is still null (first paint, before the IPC round-trip resolves) — the
  // execution-time entitlement gate in DesktopExecutionEngine stays the source of truth regardless.
  useEffect(() => {
    if (!entitlement) return;
    const canExecute = entitlement.features.includes('advancedRuntimes');
    runtimeRef.current?.setTools(getToolDefinitionsForEntitlement(canExecute));
    applySystemPrompt(canExecute);
  }, [entitlement, applySystemPrompt]);

  // Set default model based on tier on first load — Go tier gets Paw Fable (reasoning, usage credits only),
  // paid tiers get Paw Core (full capability). Only runs once when entitlement first loads.
  useEffect(() => {
    if (!entitlement) return;
    const currentModel = aiProviderConfigStore.getActivePawModel();
    const defaultModel = getDefaultModelForTier(entitlement.tier);
    // Only auto-set if user hasn't explicitly selected a model yet (still on default)
    if (currentModel === 'paw-swift') {
      aiProviderConfigStore.setActivePawModel(defaultModel);
      setActivePawModelState(defaultModel);
    }
  }, [entitlement?.tier]); // Only re-run if tier changes (e.g., after upgrade)

  const dismissCreditsNotice = useCallback(() => setCreditsNoticeTier(null), []);

  // Check if current session has reached 80-prompt limit
  const checkSessionLimit = useCallback(async (): Promise<boolean> => {
    if (!currentSessionId) return false;
    try {
      const session = await ipc.getSession(currentSessionId);
      if (!session) return false;
      // Count only user prompts (turns with non-empty transcript)
      const promptCount = session.turns.filter(t => t.transcript.trim()).length;
      setCurrentSessionPromptCount(promptCount);
      return promptCount >= 80;
    } catch {
      return false;
    }
  }, [currentSessionId, ipc]);

  // Handle New Chat - creates empty session
  const handleNewChat = useCallback(() => {
    setSessionLimitModalOpen(false);
    setPreservedPrompt(null);
    setCurrentSessionId(null);
    setCurrentSessionPromptCount(0);
    runtimeRef.current?.openPanel();
  }, []);

  // Handle Continue as New Session - creates new session with preserved prompt
  const handleContinueAsNewSession = useCallback(() => {
    if (!preservedPrompt) {
      setSessionLimitModalOpen(false);
      return;
    }
    setSessionLimitModalOpen(false);
    setCurrentSessionId(null);
    setCurrentSessionPromptCount(0);
    // Submit the preserved prompt to the new session
    const { text, context } = preservedPrompt;
    setPreservedPrompt(null);
    runtimeRef.current?.submitTranscript(text, context);
  }, [preservedPrompt]);

  // Update active session name when currentSessionId changes
  useEffect(() => {
    if (!currentSessionId) {
      setActiveSessionName(null);
      return;
    }
    let cancelled = false;
    ipc.getSession(currentSessionId).then((session) => {
      if (!cancelled && session) {
        setActiveSessionName(session.title || null);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, ipc]);

  useEffect(() => {
    // Electron's built-in webkitSpeechRecognition ('browser') cannot
    // actually work here — Chromium's speech backend needs a Google API
    // key baked into official Chrome builds, which Electron doesn't have,
    // so it reliably fails with a 'network' error a few seconds in
    // regardless of real connectivity (confirmed directly). STT instead
    // routes recorded audio to Gemini for transcription, reusing the same
    // key already configured for reasoning. TTS still uses the browser —
    // speech *synthesis* works fine in Electron, only recognition doesn't.
    const speechRecognitionProvider = createSttProvider({ id: 'gemini', apiKey: aiProviderConfigStore.getApiKey('gemini') });
    // Real speech-recognition language, persisted from the profile menu's
    // Language picker — read once here (async, so it swaps in the moment it
    // resolves rather than blocking construction) and re-applied instantly
    // whenever the user changes it, via the window event ProfileMenu fires.
    ipc.getSettings().then((s) => {
      // Real, persisted, off-by-default setting — never re-derived from the model or from
      // executionMode itself. Read once here (async, matching the speechLanguage precedent
      // immediately below); the Settings page is the only place this can be changed.
      bypassPermissionsEnabledRef.current = s.bypassPermissionsEnabled ?? false;
      setBypassPermissionsEnabledState(s.bypassPermissionsEnabled ?? false);
      if (s.speechLanguage && s.speechLanguage !== 'en-US') {
        speechLanguageRef.current = s.speechLanguage;
        runtimeRef.current?.setSpeechRecognitionProvider(
          createSttProvider({ id: 'gemini', apiKey: aiProviderConfigStore.getApiKey('gemini'), language: s.speechLanguage })
        );
        applySystemPrompt(entitlementRef.current?.features.includes('advancedRuntimes') ?? false);
      }
    }).catch(() => {});
    const onLanguageChanged = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      speechLanguageRef.current = code;
      runtimeRef.current?.setSpeechRecognitionProvider(
        createSttProvider({ id: 'gemini', apiKey: aiProviderConfigStore.getApiKey('gemini'), language: code })
      );
      applySystemPrompt(entitlementRef.current?.features.includes('advancedRuntimes') ?? false);
    };
    window.addEventListener('pawos-speech-language-changed', onLanguageChanged);
    const speechSynthesisProvider = createTtsProvider({ id: 'browser' });
    // Go-tier-safe default until the real entitlement snapshot resolves (see the entitlement
    // effect above, which immediately upgrades this via applySystemPrompt once it does) — the
    // execution-time entitlement gate in DesktopExecutionEngine stays the source of truth
    // regardless, same discipline as the tool-list filter just below.
    const reasoningRuntime = new ReasoningRuntime(aiRouter.getReasoningProvider(), buildSystemPrompt(false));

    runtimeRef.current = new ConversationRuntime({
      speechRecognition: speechRecognitionProvider,
      speechSynthesis: speechSynthesisProvider,
      reasoningRuntime,
      // A turn only reaches 'completed' after a real reasoning call succeeded (Go-tier/exhausted-
      // credit turns are stopped in submitTranscript() and never reach the runtime), so this is the
      // one honest point to record usage. This must happen here, synchronously off the runtime's own
      // notification, not from a useEffect watching the React-rendered snapshot.state: the runtime
      // transitions 'completed' -> 'idle' with no await between the two updateSnapshot() calls (see
      // ConversationRuntime.ts's drainPendingActionsAndFinalize), so React 18 batches both setState
      // calls into one render and 'completed' is never actually observed by rendered state — a real
      // bug that silently dropped every turn's usage record. onStateChange fires unbatched for every
      // transition, so it's the only reliable place to catch 'completed'. The category is derived
      // from the just-completed turn's real Task Card actions (or its real input source when no
      // action ran) — never a guessed/fabricated label. Pooled (Enterprise) accounts are skipped —
      // their consumption already happened pre-flight in submitTranscript() via
      // organizationUsageService, since the pooled RPC only supports atomic check+increment, not a
      // separate post-hoc record step.
      // Populated synchronously by the runtime, always before the matching onStateChange('completed')
      // fires for the same turn (see ConversationRuntime.ts's drainPendingActionsAndFinalize) — the
      // real, per-request Gemini usage this turn actually made, never a fabricated placeholder.
      onTurnUsage: (submission) => {
        lastTurnUsageRef.current = submission;
      },
      onStreamingUsage: (pawCompute, elapsedSeconds) => {
        setStreamingPawCompute(pawCompute);
        setStreamingElapsedSeconds(elapsedSeconds);
      },
      onStateChange: (state) => {
        onStateChangeRef.current?.(state);
        if (state === 'completed' || state === 'error') {
          setStreamingPawCompute(0);
          const currentSnapshot = runtimeRef.current?.getSnapshot();
          const lastTaskMessage = currentSnapshot ? [...currentSnapshot.messages].reverse().find((m) => m.task) : undefined;
          const actionTypes = lastTaskMessage?.task?.actions.map((a) => a.type) ?? [];
          const category = categorizeTurn(actionTypes, lastInputSourceRef.current);

          const submission = lastTurnUsageRef.current;
          lastTurnUsageRef.current = null;

          if (submission && submission.requests.length > 0) {
            // Attach authentication and organization context so the trusted main process
            // can make the authoritative Enterprise billing RPC call.
            if (entitlementRef.current?.pooled) {
              submission.organizationId = organizationIdRef.current;
              // Dynamically fetch the current session token to pass to the main process
              import('../auth/supabaseClient').then(({ getSupabaseClient }) => {
                getSupabaseClient().auth.getSession().then(({ data }) => {
                  submission.accessToken = data.session?.access_token;
                  sendSubmission(submission, category);
                });
              });
            } else {
              sendSubmission(submission, category);
            }

            function sendSubmission(sub: typeof submission, cat: AiUsageCategory) {
              ipc
                .billingRecordTurnUsage(sub, 'conversation-turn', cat, activePawModelRef.current)
                .then(async ({ balance }) => {
                  if (!entitlementRef.current?.pooled && balance) {
                    // Fetch fresh entitlement after usage recorded to check if tier is actually exhausted
                    ipc.entitlementGetSnapshot().then((snap) => {
                      setCreditsNoticeTier(snap.hasCreditsRemaining ? null : snap.tier);
                    }).catch(() => {
                      // On fetch error, fallback to current entitlementRef (stale but safe)
                      setCreditsNoticeTier(entitlementRef.current?.hasCreditsRemaining ? null : (entitlementRef.current?.tier ?? 'go'));
                    });
                  }
                  refreshEntitlement();
                })
                .catch(() => {
                  ipc.billingReleaseGenerationSlot().finally(() => refreshEntitlement());
                });
            }
          } else {
            // No verified usage: just release the slot and refresh
            ipc.billingReleaseGenerationSlot().finally(() => refreshEntitlement());
          }
        }
      },
      executeAction: withAutonomousTaskBilling(withGovernanceGate((request) => ipc.executeAction(request))),
      checkActionRequirements: (request) => ipc.checkActionRequirements(request),
      getExecutionMode: () => executionModeRef.current,
      isBypassPermissionsEnabled: () => bypassPermissionsEnabledRef.current,
      describeAction: (request) => ipc.describeAction(request),
      reportActionResult: (request, result) => ipc.reportActionResult(request, result),
      onProcessOutput: (cb) => ipc.onProcessOutput(cb),
      onProcessExit: (cb) => ipc.onProcessExit(cb),
      onWorkspaceObservation: (cb) => ipc.onWorkspaceObservation(cb),
      onCommunicationEvent: (cb) => ipc.onCommunicationEvent(cb),
      onGovernanceApproved: (cb) => {
        const unsubscribe = ipc.onGovernanceApproved(cb);
        return unsubscribe;
      },
      onGovernanceDenied: (cb) => {
        const unsubscribe = ipc.onGovernanceDenied(cb);
        return unsubscribe;
      },
      onRequestPlan: async (plan) => {
        return new Promise((resolve) => {
          (window as any).__planResolve = (decision: 'approve' | 'deny' | 'revise') => {
            resolve(decision);
          };
          window.dispatchEvent(new CustomEvent('pawos-request-plan', { detail: plan }));
        });
      },
      onRequestApproval: async (options) => {
        // Check if user has "Always allow" preference for this action
        try {
          const alwaysAllowKey = `gov_always_allow_${options.action}`;
          const alwaysAllow = localStorage.getItem(alwaysAllowKey) === 'true';
          if (alwaysAllow) {
            console.log(`[GOVERNANCE] Auto-approved (always allow): ${options.verb} ${options.target}`);
            return true;
          }
        } catch (e) {
          // localStorage may not be available
        }

        return new Promise((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.warn('[GOVERNANCE] Approval timeout, allowing by default');
              resolve(true);
            }
          }, 30000);

          // Store resolver so ConversationPanel can call it when user decides
          (window as any).__governanceResolve = (approved: boolean, rememberChoice?: boolean) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              if (rememberChoice && approved) {
                try {
                  localStorage.setItem(`gov_always_allow_${options.action}`, 'true');
                } catch (e) {
                  // localStorage may not be available
                }
              }
              resolve(approved);
            }
          };
          // Dispatch custom event that ConversationPanel listens to
          window.dispatchEvent(new CustomEvent('pawos-request-approval', { detail: options }));
        });
      },
      onVisemeFrame: (frame) => onVisemeFrameRef.current?.(frame),
      persistTurn: (turn, hint) => {
        return ipc.appendSessionTurn(turn, hint).then((session) => {
          setCurrentSessionId(session.id);
          // Count user prompts in the session
          const promptCount = session.turns.filter(t => t.transcript.trim()).length;
          setCurrentSessionPromptCount(promptCount);
          return session;
        });
      },
      persistExecution: (record) => ipc.recordExecution(record),
      resolveSession: async (transcript) => {
        try {
          const summaries = await ipc.listSessions();
          const candidates = summaries
            .filter((s) => !s.archived)
            .slice(0, 8)
            .map((s) => ({ id: s.id, title: s.title, lastMessage: s.lastMessage }));
          if (candidates.length === 0) return { type: 'auto' as const };

          const { decision, usage } = await aiRouter.classifySessionContinuation(transcript, candidates);
          // Real, provider-reported usage for this one classification request — reported to the
          // main process (the only place that ever writes to the durable usage ledger) exactly like
          // every other backgroundTask Gemini call site; never estimated, never billed twice.
          if (usage) ipc.billingReportUsageEvent(usage, 'backgroundTask', { sessionId: null, runId: null }).catch(() => {});
          if (decision.action === 'continue' && decision.sessionId) {
            return { type: 'continue' as const, sessionId: decision.sessionId };
          }
          if (decision.action === 'new') return { type: 'new' as const };
          return { type: 'auto' as const };
        } catch {
          // Classification failed (no key configured, network error, etc.)
          // — defer to the store's own time-based heuristic rather than
          // blocking the turn on a decision that couldn't be made.
          return { type: 'auto' as const };
        }
      },
    });

    const unsubscribe = runtimeRef.current.subscribe(setSnapshot);

    // Re-point at the newly-configured provider the moment Settings changes
    // it (e.g. the Gemini key finishes loading from .env after this effect
    // already ran) — no restart needed for either reasoning or STT.
    const unsubscribeConfig = aiProviderConfigStore.subscribe(() => {
      runtimeRef.current?.setReasoningProvider(aiRouter.getReasoningProvider());
      runtimeRef.current?.setSpeechRecognitionProvider(
        createSttProvider({ id: 'gemini', apiKey: aiProviderConfigStore.getApiKey('gemini') })
      );
      setActivePawModelState(aiProviderConfigStore.getActivePawModel());
    });

    return () => {
      unsubscribe();
      unsubscribeConfig();
      window.removeEventListener('pawos-speech-language-changed', onLanguageChanged);
      runtimeRef.current?.close();
      runtimeRef.current = null;
    };
  }, [ipc]);

  const open = useCallback(() => runtimeRef.current?.open(), []);
  const openPanel = useCallback(() => runtimeRef.current?.openPanel(), []);
  const startListening = useCallback(() => {
    const tryGate = (retryCount = 0) => {
      ipc
        .billingCanStartGeneration(activePawModelRef.current)
        .then((gateResult) => {
          ipc.billingReleaseGenerationSlot();
          if (!gateResult.allowed) {
            if (gateResult.reason === 'inflight' && retryCount < 2) {
              setTimeout(() => tryGate(retryCount + 1), 2000);
              return;
            }
            setCreditsNoticeTier(entitlementRef.current?.tier ?? 'go');
            return;
          }
          runtimeRef.current?.startListening();
        })
        .catch(() => {
          runtimeRef.current?.startListening();
        });
    };
    tryGate();
  }, [ipc]);
  const stopListening = useCallback(() => runtimeRef.current?.stopListening(), []);
  const close = useCallback(() => runtimeRef.current?.close(), []);
  const toggle = useCallback(() => runtimeRef.current?.toggle(), []);
  const cancel = useCallback(() => runtimeRef.current?.cancel(), []);
  // Real provenance for the Analytics dashboard's 'voice' category: undefined means the turn came
  // through the push-to-talk speech pipeline rather than typed/pasted/attached text — see
  // categorizeTurn in AiUsageCategories.ts.
  const lastInputSourceRef = useRef<SubmittedInputContext['source']>(undefined);
  const submitTranscript = useCallback(
    (text: string, context?: SubmittedInputContext) => {
      // Large prompt handling: if text has >700 lines, create a temporary attachment
      let finalContext = context;
      const lines = text.split('\n');
      if (lines.length > 700) {
        // Extract filename from first non-empty line
        const firstNonEmptyLine = lines.find(line => line.trim()) || '';
        const filename = firstNonEmptyLine.trim().slice(0, 100) || 'untitled_prompt.txt';

        finalContext = {
          ...context,
          source: 'largePrompt',
          largePromptAttachment: {
            filename,
            content: text,
            lineCount: lines.length,
          },
        };
      }

      const current = entitlementRef.current;
      if (current && current.models.length === 0) {
        setCreditsNoticeTier(current.tier);
        return;
      }

      // Security backstop — the renderer's model picker (selectModel, below) already refuses to
      // select a model the account isn't entitled to, but nothing upstream of this point re-checks
      // that the *currently active* model (aiProviderConfigStore's persisted state) is still one
      // this account's entitlement actually grants — e.g. after a downgrade, or a stale
      // localStorage value from a different account on the same machine. Never let an unentitled
      // model reach the reasoning provider: silently fall back to paw-flash (present in every
      // tier's model list, including Go) rather than blocking the turn outright.
      if (current && current.models.length > 0 && !current.models.includes(aiProviderConfigStore.getActivePawModel())) {
        aiRouter.setActivePawModel('paw-flash');
      }

      // Pooled (Enterprise) Paw Compute has no local counter to check ahead of time — the pool is
      // authoritative in Supabase, so the only real check is attempting the increment itself.
      // Matching organizationUsageService's own documented contract for every other pooled capability:
      // call recordUsage() before dispatching, treat a throw as "blocked."
      if (current?.pooled) {
        const organizationId = organizationIdRef.current;
        if (!organizationId) {
          // Org membership hasn't resolved yet this session — fail open rather than block a
          // legitimate Enterprise user on a transient startup race.
          lastInputSourceRef.current = finalContext?.source;
          runtimeRef.current?.submitTranscript(text, finalContext);
          return;
        }
        organizationUsageService
          .recordUsage(organizationId, 'aiReasoning', 1)
          .then(() => {
            lastInputSourceRef.current = finalContext?.source;
            runtimeRef.current?.submitTranscript(text, finalContext);
          })
          .catch(() => {
            setCreditsNoticeTier(current.tier);
          });
        return;
      }

      // Fresh authoritative gate from the main process — never relies on the stale renderer
      // snapshot (entitlementRef.current) for the generation-allowed decision. The main process
      // reads current rolling-window usage directly from UsageEventStore, computes tier limits from
      // PawComputeCapacityStore, and reserves an in-flight slot atomically. This covers both Fable
      // (gates on purchased-credit headroom) and normal turns (gates on rolling PC windows) in one
      // call. Renderer-provided tier, usage, balance, and authorization result are never trusted.
      // Check session prompt limit before proceeding
      const checkAndSubmit = async () => {
        const limitReached = await checkSessionLimit();
        if (limitReached) {
          // Session limit reached - show modal and preserve the prompt
          setPreservedPrompt({ text, context: finalContext });
          setSessionLimitModalOpen(true);
          return;
        }

        const tryGate = (retryCount = 0) => {
          ipc
            .billingCanStartGeneration(activePawModelRef.current)
            .then((gateResult) => {
              if (!gateResult.allowed) {
                // Distinguish in-flight slot blocking (transient, auto-resolves in <60s) from real
                // quota exhaustion. In-flight blocking means another generation's slot hasn't been
                // released yet — retry once after a short delay rather than showing the exhaustion
                // banner, since the slot will be released when that turn's billingRecordTurnUsage
                // completes (or auto-releases on its 60s timeout).
                if (gateResult.reason === 'inflight' && retryCount < 2) {
                  setTimeout(() => tryGate(retryCount + 1), 2000);
                  return;
                }
                setCreditsNoticeTier(entitlementRef.current?.tier ?? 'go');
                return;
              }
              lastInputSourceRef.current = finalContext?.source;
              runtimeRef.current?.submitTranscript(text, finalContext);
            })
            .catch(() => {
              // IPC failure — refresh entitlement to get the real, authoritative state before
              // deciding whether to block. A transient IPC error should NOT show "More Paw Compute
              // needed" if the account actually has capacity remaining.
              ipc.entitlementGetSnapshot().then((snap) => {
                if (snap.hasCreditsRemaining) {
                  // Authoritative state says capacity remains — fail open rather than block a
                  // legitimate user on a transient IPC error. The generation-time gate in the main
                  // process will still enforce limits if the request actually proceeds.
                  lastInputSourceRef.current = finalContext?.source;
                  runtimeRef.current?.submitTranscript(text, finalContext);
                } else {
                  setCreditsNoticeTier(snap.tier);
                }
                setEntitlement(snap);
              }).catch(() => {
                // Both IPC calls failed — fail closed as a last resort.
                setCreditsNoticeTier(entitlementRef.current?.tier ?? 'go');
              });
            });
        };
        tryGate();
      };
      checkAndSubmit();
    },
    []
  );

  const speak = useCallback(
    (text: string) => {
      const tryGate = (retryCount = 0) => {
        ipc
          .billingCanStartGeneration(activePawModelRef.current)
          .then((gateResult) => {
            ipc.billingReleaseGenerationSlot();
            if (!gateResult.allowed) {
              if (gateResult.reason === 'inflight' && retryCount < 2) {
                setTimeout(() => tryGate(retryCount + 1), 2000);
                return;
              }
              setCreditsNoticeTier(entitlementRef.current?.tier ?? 'go');
              return;
            }
            runtimeRef.current?.speak(text);
          })
          .catch(() => {
            runtimeRef.current?.speak(text);
          });
      };
      tryGate();
    },
    [ipc]
  );
  const setVoiceOutputEnabled = useCallback((enabled: boolean) => runtimeRef.current?.setVoiceOutputEnabled(enabled), []);
  const stopSpeechPlayback = useCallback(() => runtimeRef.current?.stopSpeechPlayback(), []);

  const setReasoningProvider = useCallback((provider: ReasoningProvider) => {
    runtimeRef.current?.setReasoningProvider(provider);
  }, []);
  /** Sets/updates the personality addendum layered onto the tier-aware base prompt — see
   *  applySystemPrompt above for why this composes rather than overwrites. */
  const setPersonalityAddendum = useCallback((addendum: string) => {
    personalityAddendumRef.current = addendum;
    const canExecute = entitlementRef.current?.features.includes('advancedRuntimes') ?? false;
    applySystemPrompt(canExecute);
  }, [applySystemPrompt]);
  const setSpeechSynthesisProvider = useCallback((config: TtsProviderConfig) => {
    runtimeRef.current?.setSpeechSynthesisProvider(createTtsProvider(config));
  }, []);

  /** "Retry failed step" in a Task Card's Details panel. */
  const retryAction = useCallback(
    (taskId: string, actionId: string) => runtimeRef.current?.retryTaskAction(taskId, actionId),
    []
  );
  /** "Open" a file/folder a Task Card touched — a direct desktop action, outside the conversation/narration pipeline. */
  const openPath = useCallback(
    (path: string, kind: 'file' | 'folder') => {
      void ipc.executeAction(kind === 'folder' ? { type: 'openFolder', path } : { type: 'openFile', path });
    },
    [ipc]
  );

  /** Inline "Connect {capability}" submit from a paused Task Card — saves the credential, then
   *  resumes the paused action via the same retryTaskAction the manual "↻ Retry" button uses. */
  const connectCapability = useCallback(
    (taskId: string, actionId: string, connectorId: string, fields: Record<string, string>, opts?: { incrementalCapability?: string }) =>
      runtimeRef.current?.connectCapabilityAndRetry(taskId, actionId, connectorId, fields, opts) ??
      Promise.resolve({ ok: false, message: 'Not available.' }),
    []
  );

  return {
    snapshot,
    open,
    openPanel,
    startListening,
    stopListening,
    close,
    toggle,
    cancel,
    submitTranscript,
    speak,
    setVoiceOutputEnabled,
    stopSpeechPlayback,
    setReasoningProvider,
    setPersonalityAddendum,
    setSpeechSynthesisProvider,
    retryAction,
    connectCapability,
    openPath,
    creditsNoticeTier,
    dismissCreditsNotice,
    refreshEntitlement,
    entitlement,

    executionMode,
    setExecutionMode,
    bypassPermissionsEnabled,
    activePawModel,
    modelTierRequirements,
    selectModel,
    streamingPawCompute,
    streamingElapsedSeconds,

    // Session management
    currentSessionId,
    setCurrentSessionId,
    currentSessionPromptCount,
    sessionLimitModalOpen,
    setSessionLimitModalOpen,
    preservedPrompt,
    handleNewChat,
    handleContinueAsNewSession,
    checkSessionLimit,
    activeSessionName,
  };
}
