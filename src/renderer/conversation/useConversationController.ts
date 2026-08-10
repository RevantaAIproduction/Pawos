import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationRuntime } from './ConversationRuntime';
import type { ConversationSnapshot } from './ConversationTypes';
import { createSttProvider, createTtsProvider, type TtsProviderConfig } from './SpeechProviderRegistry';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';
import { aiRouter } from '../ai/AIRouter';
import { aiProviderConfigStore } from '../ai/AIProviderConfigStore';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import { withGovernanceGate } from '../organization/GovernanceGate';
import { withAutonomousTaskBilling } from '../organization/AutonomousTaskBillingGate';
import type { VisemeFrame } from './LipSyncTypes';
import type { SubmittedInputContext } from './ConversationTypes';
import { buildSystemPrompt, buildLanguageInstruction } from './systemPrompt';
import type { EntitlementSnapshot, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { categorizeTurn } from '../../shared/billing/AiUsageCategories';
import { getToolDefinitionsForEntitlement } from '../ai/IntentRegistry';
import { organizationService } from '../organization/OrganizationService';
import { organizationUsageService } from '../billing/OrganizationUsageService';
import { referralCreditService } from '../organization/ReferralCreditService';
import { PAW_COMPUTE_UNITS_PER_CREDIT_USD } from '../../shared/billing/ReferralCreditTypes';

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
    pendingConfirmation: false,
  });

  const runtimeRef = useRef<ConversationRuntime | null>(null);
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

  const applySystemPrompt = useCallback((canExecute: boolean) => {
    const base = buildSystemPrompt(canExecute);
    const addendum = personalityAddendumRef.current;
    const languageInstruction = buildLanguageInstruction(speechLanguageRef.current);
    const combined = [base, addendum, languageInstruction].filter(Boolean).join('\n\n');
    runtimeRef.current?.setReasoningSystemPrompt(combined);
  }, []);

  const refreshEntitlement = useCallback(() => {
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
  }, [ipc]);

  useEffect(() => {
    refreshEntitlement();
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

  const dismissCreditsNotice = useCallback(() => setCreditsNoticeTier(null), []);

  // Paw Credits ("Referral Credits") balance — fetched lazily only once the exhaustion notice is
  // actually showing, since it requires a real Supabase round trip and most turns never hit this
  // wall. Never fetched for a pooled (Enterprise) account, which has no personal wallet.
  const [pawCreditsBalanceUsd, setPawCreditsBalanceUsd] = useState(0);
  const [redeemingCredits, setRedeemingCredits] = useState(false);
  const [redeemCreditsError, setRedeemCreditsError] = useState<string | null>(null);

  useEffect(() => {
    if (!creditsNoticeTier || entitlementRef.current?.pooled) return;
    let cancelled = false;
    referralCreditService
      .getBalance()
      .then((balance) => {
        if (!cancelled) setPawCreditsBalanceUsd(balance.balanceUsd);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creditsNoticeTier]);

  // Redeems the entire current Paw Credits balance for bonus Paw Compute this period — the dollar
  // deduction happens first, server-side and authoritative (redeem_referral_credits_for_compute());
  // only after that succeeds does the local compute bonus get granted, so a failure here never
  // grants compute without actually having spent the credits.
  const useCreditsForCompute = useCallback(async () => {
    if (pawCreditsBalanceUsd <= 0) return;
    setRedeemingCredits(true);
    setRedeemCreditsError(null);
    try {
      const { remainingBalanceUsd } = await referralCreditService.redeemForCompute(pawCreditsBalanceUsd);
      const units = Math.floor(pawCreditsBalanceUsd * PAW_COMPUTE_UNITS_PER_CREDIT_USD);
      await ipc.billingGrantComputeBonus(units);
      setPawCreditsBalanceUsd(remainingBalanceUsd);
      refreshEntitlement();
      setCreditsNoticeTier(null);
    } catch (e) {
      setRedeemCreditsError(e instanceof Error ? e.message : 'Could not redeem Paw Credits right now.');
    } finally {
      setRedeemingCredits(false);
    }
  }, [pawCreditsBalanceUsd, ipc, refreshEntitlement]);

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
      onStateChange: (state) => onStateChangeRef.current?.(state),
      executeAction: withAutonomousTaskBilling(withGovernanceGate((request) => ipc.executeAction(request))),
      checkActionRequirements: (request) => ipc.checkActionRequirements(request),
      describeAction: (request) => ipc.describeAction(request),
      reportActionResult: (request, result) => ipc.reportActionResult(request, result),
      onProcessOutput: (cb) => ipc.onProcessOutput(cb),
      onProcessExit: (cb) => ipc.onProcessExit(cb),
      onWorkspaceObservation: (cb) => ipc.onWorkspaceObservation(cb),
      onCommunicationEvent: (cb) => ipc.onCommunicationEvent(cb),
      onVisemeFrame: (frame) => onVisemeFrameRef.current?.(frame),
      persistTurn: (turn, hint) => ipc.appendSessionTurn(turn, hint),
      persistExecution: (record) => ipc.recordExecution(record),
      resolveSession: async (transcript) => {
        try {
          const summaries = await ipc.listSessions();
          const candidates = summaries
            .filter((s) => !s.archived)
            .slice(0, 8)
            .map((s) => ({ id: s.id, title: s.title, lastMessage: s.lastMessage }));
          if (candidates.length === 0) return { type: 'auto' as const };

          const decision = await aiRouter.classifySessionContinuation(transcript, candidates);
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
  const close = useCallback(() => runtimeRef.current?.close(), []);
  const toggle = useCallback(() => runtimeRef.current?.toggle(), []);
  const cancel = useCallback(() => runtimeRef.current?.cancel(), []);
  // Real provenance for the Analytics dashboard's 'voice' category: undefined means the turn came
  // through the push-to-talk speech pipeline rather than typed/pasted/attached text — see
  // categorizeTurn in AiUsageCategories.ts.
  const lastInputSourceRef = useRef<SubmittedInputContext['source']>(undefined);
  const submitTranscript = useCallback(
    (text: string, context?: SubmittedInputContext) => {
      const current = entitlementRef.current;
      if (current && (current.models.length === 0 || !current.hasCreditsRemaining)) {
        setCreditsNoticeTier(current.tier);
        return;
      }

      // Pooled (Enterprise) Paw Compute has no local counter to check ahead of time — the pool is
      // authoritative in Supabase, so the only real check is attempting the increment itself.
      // hasCreditsRemaining() above is unconditionally true for a pooled tier at the local-snapshot
      // layer (see EntitlementService.isComputePooled()'s doc comment), so this is the actual gate
      // for Enterprise, matching organizationUsageService's own documented contract for every other
      // pooled capability: call recordUsage() before dispatching, treat a throw as "blocked."
      if (current?.pooled) {
        const organizationId = organizationIdRef.current;
        if (!organizationId) {
          // Org membership hasn't resolved yet this session — fail open rather than block a
          // legitimate Enterprise user on a transient startup race.
          lastInputSourceRef.current = context?.source;
          runtimeRef.current?.submitTranscript(text, context);
          return;
        }
        organizationUsageService
          .recordUsage(organizationId, 'aiReasoning', 1)
          .then(() => {
            lastInputSourceRef.current = context?.source;
            runtimeRef.current?.submitTranscript(text, context);
          })
          .catch(() => {
            setCreditsNoticeTier(current.tier);
          });
        return;
      }

      lastInputSourceRef.current = context?.source;
      runtimeRef.current?.submitTranscript(text, context);
    },
    []
  );

  // A turn only reaches 'completed' after a real reasoning call succeeded
  // (Go-tier/exhausted-credit turns are stopped above and never reach the
  // runtime), so this is the one honest point to record usage. The category
  // is derived from the just-completed turn's real Task Card actions (or its
  // real input source when no action ran) — never a guessed/fabricated label.
  // Pooled (Enterprise) accounts are skipped here — their consumption already
  // happened pre-flight in submitTranscript() via organizationUsageService,
  // since the pooled RPC only supports atomic check+increment, not a
  // separate post-hoc record step (see submitTranscript's own comment).
  useEffect(() => {
    if (snapshot.state === 'completed' && !entitlementRef.current?.pooled) {
      const lastTaskMessage = [...snapshot.messages].reverse().find((m) => m.task);
      const actionTypes = lastTaskMessage?.task?.actions.map((a) => a.type) ?? [];
      const category = categorizeTurn(actionTypes, lastInputSourceRef.current);
      ipc.billingConsumeCredit(1, 'conversation-turn', category).then(() => refreshEntitlement()).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.state, ipc, refreshEntitlement]);
  const speak = useCallback((text: string) => runtimeRef.current?.speak(text), []);

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
    close,
    toggle,
    cancel,
    submitTranscript,
    speak,
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
    pawCreditsBalanceUsd,
    useCreditsForCompute,
    redeemingCredits,
    redeemCreditsError,
  };
}
