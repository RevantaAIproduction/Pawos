import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './conversationPanel.module.css';
import type { ConversationSnapshot, SubmittedInputContext } from './ConversationTypes';
import { conversationStateLabels } from './ConversationTypes';
import { TaskCard } from './TaskCard';
import { ProjectPlanCard } from './ProjectPlanCard';
import { isProjectPlanMessage } from './ProjectPlanningUX';
import { SupportPersonaIndicator, useSupportPersona } from './SupportPersonaIndicator';
import { isSupportRequest } from '../../shared/support/SupportTrigger';
import { CreditsRequiredNotice, getExhaustionPrimaryActions } from '../ui/billing/CreditsRequiredNotice';
import type { EntitlementSnapshot, SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { DEFAULT_EXECUTION_MODE, EXECUTION_MODE_CATALOG, type ConversationExecutionMode } from '../../shared/actions/ExecutionModeTypes';
import {
  DEFAULT_PAW_MODEL_ID,
  PAW_MODEL_CATALOG,
  REASONING_PAW_MODEL_IDS,
  getPawModel,
  type PawModelDescriptor,
  type PawModelId,
} from '../../shared/ai/PawModelTypes';
import { formatTierLabel } from '../billing/EntitlementDisplay';

/** Reasoning models are genuinely selectable (they change which model actually answers); the rest
 *  of the catalog are automatic, specialized routers Paw invokes per-need — shown for transparency
 *  only, never clickable, mirroring AISettingsPage.tsx's own "Default reasoning model" vs. "All Paw
 *  models" split. */
type ModelUiState = 'available' | 'locked' | 'exhausted' | 'comingSoon';

function getModelUiState(model: PawModelDescriptor, entitlement: EntitlementSnapshot | null | undefined): ModelUiState {
  if (model.status === 'comingSoon') return 'comingSoon';
  if (!entitlement || !entitlement.models.includes(model.id)) return 'locked';
  if (!entitlement.hasCreditsRemaining) return 'exhausted';
  return 'available';
}

/** Below this, a paste is probably just a short phrase someone copied — above it, it reads as reference material to skim/summarize rather than a spoken command. */
const PASTE_LENGTH_THRESHOLD = 200;

/** Plain-text-readable formats only — full document/spreadsheet parsing (PDF, docx, xlsx) is real future work, not something to fake here. Images are handled separately below (Reference Intelligence), not as text. */
const SUPPORTED_FILE_EXTENSIONS = ['.txt', '.csv', '.json', '.md', '.log'];
/** Reference material for Reference/Image Intelligence (a screenshot, mockup, logo) — analyzed via analyze_reference_image, never read as text. */
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MAX_FILE_CHARS = 20_000;

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

export function ConversationPanel({
  snapshot,
  onClose,
  onStartListening,
  onStopListening,
  onSendTranscript,
  onSetVoiceOutputEnabled,
  onStopSpeechPlayback,
  onSpeakMessage,
  onRetryAction,
  onOpenPath,
  onConnectCapability,
  onNavigateToSettingsConnector,
  onOpenTicketBalance,
  onPlanDecision,
  creditsNoticeTier,
  creditsNoticeSeatTier,
  creditsNoticePooled,
  enterpriseContactAvailable,
  onDismissCreditsNotice,
  onUpgrade,
  onBuyCompute,
  onContactSales,
  onContactAdmin,
  onRequestMoreCompute,
  pawCreditsBalanceUsd,
  onUseCredits,
  redeemingCredits,
  redeemCreditsError,
  executionMode,
  onSetExecutionMode,
  bypassPermissionsEnabled,
  entitlement,
  activePawModel,
  modelTierRequirements,
  onSelectModel,
}: {
  snapshot: ConversationSnapshot;
  onClose: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSendTranscript: (text: string, context?: SubmittedInputContext) => void;
  onSetVoiceOutputEnabled: (enabled: boolean) => void;
  onStopSpeechPlayback: () => void;
  onSpeakMessage: (text: string) => void;
  /** "Retry failed step" in a Task Card's Details panel — re-runs one action from its own recorded request. */
  onRetryAction?: (taskId: string, actionId: string) => void;
  /** "Open" next to a file/folder a Task Card touched. */
  onOpenPath?: (path: string, kind: 'file' | 'folder') => void;
  /** Inline "Connect {capability}" submit from a paused Task Card. */
  onConnectCapability?: (
    taskId: string,
    actionId: string,
    connectorId: string,
    fields: Record<string, string>,
    opts?: { incrementalCapability?: string }
  ) => Promise<{ ok: boolean; message?: string }> | void;
  /** "Connect in Settings" for a capability with no inline form yet. */
  onNavigateToSettingsConnector?: (connectorId: string) => void;
  /** "Add Funds" on a balance-restricted Autonomous Work failure — opens the Ticket Balance wallet (Settings → Billing). */
  onOpenTicketBalance?: () => void;
  onPlanDecision?: (planId: string, decision: 'approved' | 'rejected', message: string) => void;
  /** Set when the last submit was blocked by the entitlement/credit gate (see useConversationController). */
  creditsNoticeTier?: SubscriptionTierId | null;
  /** Only meaningful when tier === 'team' — which seat rate determines the exhaustion notice's upgrade target. */
  creditsNoticeSeatTier?: SeatTier;
  /** True only for Enterprise (pooled Paw Compute) — see EntitlementSnapshot.pooled. */
  creditsNoticePooled?: boolean;
  /** Whether the Pro Max -> Enterprise "Contact Sales" path is reachable from this screen. */
  enterpriseContactAvailable?: boolean;
  onDismissCreditsNotice?: () => void;
  /** Opens the in-app upgrade flow for the next tier up — omit where there's no real navigation target yet. */
  onUpgrade?: () => void;
  /** Opens the Paw Compute top-up flow — omit where there's no real navigation target yet. */
  onBuyCompute?: () => void;
  /** Opens the Enterprise info/signup page — omit where there's no real navigation target yet. */
  onContactSales?: () => void;
  onContactAdmin?: () => void;
  onRequestMoreCompute?: () => void;
  pawCreditsBalanceUsd?: number;
  onUseCredits?: () => void;
  redeemingCredits?: boolean;
  redeemCreditsError?: string | null;
  /** The composer's mode picker — see ExecutionModeTypes.ts. Defaults to Auto (today's behavior) when omitted. */
  executionMode?: ConversationExecutionMode;
  onSetExecutionMode?: (mode: ConversationExecutionMode) => void;
  /** Whether the Settings-only "Bypass permissions" toggle is currently on — gates whether that mode is selectable at all. */
  bypassPermissionsEnabled?: boolean;
  /** The composer's model picker — see PawModelTypes.ts/AIRouter.ts. Authoritative for what's actually
   *  selectable/locked/exhausted; the renderer never grants access on its own (see selectModel in
   *  useConversationController.ts and the submitTranscript backstop it also adds). */
  entitlement?: EntitlementSnapshot | null;
  activePawModel?: PawModelId;
  modelTierRequirements?: Partial<Record<PawModelId, SubscriptionTierId>>;
  onSelectModel?: (id: PawModelId) => void;
}) {
  const [draft, setDraft] = useState('');
  const [wasPasted, setWasPasted] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [supportPersona, setSupportPersona] = useState<string | null>(null);
  const [showPersonaButton, setShowPersonaButton] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const lastSyncedVoiceDraftRef = useRef('');
  const activeExecutionMode = executionMode ?? DEFAULT_EXECUTION_MODE;
  const activeModeDescriptor =
    EXECUTION_MODE_CATALOG.find((m) => m.id === activeExecutionMode) ?? EXECUTION_MODE_CATALOG.find((m) => m.id === DEFAULT_EXECUTION_MODE)!;
  const activePawModelDescriptor = getPawModel(activePawModel ?? DEFAULT_PAW_MODEL_ID);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) setModeMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [modeMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [modelMenuOpen]);

  const latestMessage = useMemo(() => snapshot.messages[snapshot.messages.length - 1], [snapshot.messages]);

  // Action narration (system lines) get appended just like any other
  // message — without this, they scroll out of view the moment the
  // transcript overflows its fixed height, so the user never actually
  // sees "Installing X…" / "Setting Y…" happen even though it's right
  // there in the DOM. Every new message — including in-place narration
  // updates from streaming to final — should keep the latest one in view.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snapshot.messages, snapshot.draftTranscript]);

  useEffect(() => {
    if (!snapshot.draftTranscript || (snapshot.state !== 'listening' && snapshot.state !== 'idle')) return;
    if (draft && draft !== lastSyncedVoiceDraftRef.current) return;
    setDraft(snapshot.draftTranscript);
    lastSyncedVoiceDraftRef.current = snapshot.draftTranscript;
    setWasPasted(false);
    requestAnimationFrame(resizeTextarea);
  }, [draft, snapshot.draftTranscript, snapshot.state]);
  // While performing an action, show what's actually happening ("Opening VS
  // Code…") instead of the generic "Performing action" — Desktop Status
  // should always name the real activity, not just the state machine's name for it.
  const latestSystemMessage = useMemo(
    () => [...snapshot.messages].reverse().find((m) => m.role === 'system'),
    [snapshot.messages]
  );
  const stateLabel =
    snapshot.state === 'performingAction' && latestSystemMessage
      ? (latestSystemMessage.task
          ? latestSystemMessage.task.actions[latestSystemMessage.task.actions.length - 1]?.inProgressText ?? latestSystemMessage.task.goal
          : latestSystemMessage.content)
      : conversationStateLabels[snapshot.state];

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const send = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    // Auto-activate persona if user requests support
    if (!supportPersona && isSupportRequest(text)) {
      setSupportPersona('Support Specialist');
      setShowPersonaButton(false);
    }
    onSendTranscript(text, wasPasted ? { source: 'pasted' } : undefined);
    setDraft('');
    lastSyncedVoiceDraftRef.current = '';
    setWasPasted(false);
    requestAnimationFrame(resizeTextarea);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) void handleImageChosen(file);
      return;
    }
    const pasted = event.clipboardData.getData('text');
    if (pasted.length > PASTE_LENGTH_THRESHOLD) setWasPasted(true);
  };

  const handleAttachClick = () => {
    setAttachError(null);
    fileInputRef.current?.click();
  };

  const handleImageChosen = async (file: File) => {
    setAttachError(null);
    try {
      const imageDataUrl = await readImageAsDataUrl(file);
      onSendTranscript(`📎 ${file.name || 'pasted image'}`, { source: 'image', imageDataUrl });
    } catch {
      setAttachError('I could not read that image.');
    }
  };

  const handleFileChosen = async (file: File) => {
    setAttachError(null);
    const ext = getExtension(file.name);
    if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      void handleImageChosen(file);
      return;
    }
    if (!SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
      setAttachError(
        `I can only read plain text or image files right now (${[...SUPPORTED_FILE_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS].join(', ')}).`
      );
      return;
    }

    const content = await file.text();
    const truncated = content.length > MAX_FILE_CHARS;
    const reasoningText = truncated
      ? `${content.slice(0, MAX_FILE_CHARS)}\n\n[Truncated — the file continues beyond this point.]`
      : content;

    onSendTranscript(`📎 ${file.name}`, { reasoningText, source: 'file' });
  };

  return (
    <section className={styles.panel} aria-label="Conversation panel">
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Conversation</div>
          <div className={styles.title}>{stateLabel}</div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={snapshot.voiceOutputEnabled ? styles.voiceToggleOn : styles.voiceToggle}
            onClick={() => onSetVoiceOutputEnabled(!snapshot.voiceOutputEnabled)}
            type="button"
            aria-pressed={snapshot.voiceOutputEnabled}
          >
            Voice Output: {snapshot.voiceOutputEnabled ? 'ON' : 'OFF'}
          </button>
          {snapshot.speechPlaybackState === 'speaking' && (
            <button className={styles.voiceToggle} onClick={onStopSpeechPlayback} type="button">
              Pause
            </button>
          )}
          {snapshot.state === 'listening' ? (
            <button className={styles.stopRecordBtn} onClick={onStopListening} type="button">
              Stop Recording
            </button>
          ) : (
            <button className={styles.listenBtn} onClick={onStartListening} type="button">
              {snapshot.state === 'waitingForPermission' || snapshot.state === 'error' ? 'Retry Recording' : 'Start Recording'}
            </button>
          )}
          <button className={styles.closeBtn} onClick={onClose} type="button">
            Close
          </button>
        </div>
      </header>

      <div className={styles.meta}>
        <span>{snapshot.supportsSpeechRecognition ? 'Speech recognition ready' : 'Type mode fallback'}</span>
        <span>Voice Output: {snapshot.voiceOutputEnabled ? 'ON' : 'OFF'}</span>
        <span>
          {snapshot.speechPlaybackState === 'speaking'
            ? 'Speaking...'
            : snapshot.speechPlaybackState === 'paused'
              ? 'Paused'
              : snapshot.supportsSpeechSynthesis
                ? 'Speech output available'
                : 'Speech output fallback'}
        </span>
      </div>

      {creditsNoticeTier && onDismissCreditsNotice && (
        <CreditsRequiredNotice
          tier={creditsNoticeTier}
          seatTier={creditsNoticeSeatTier}
          pooled={creditsNoticePooled ?? false}
          enterpriseContactAvailable={enterpriseContactAvailable}
          onDismiss={onDismissCreditsNotice}
          onUpgrade={onUpgrade}
          onBuyCompute={onBuyCompute}
          onContactSales={onContactSales}
          onContactAdmin={onContactAdmin}
          onRequestMoreCompute={onRequestMoreCompute}
          pawCreditsBalanceUsd={pawCreditsBalanceUsd}
          onUseCredits={onUseCredits}
          redeeming={redeemingCredits}
          redeemError={redeemCreditsError}
        />
      )}

      <div ref={transcriptRef} className={styles.transcript} role="log" aria-live="polite" aria-relevant="additions text">
        {snapshot.messages.length === 0 && (
          <div className={styles.emptyState}>No conversation yet. Activate listening or type a message.</div>
        )}
        {showPersonaButton && !supportPersona && (
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => {
                setSupportPersona('Support Specialist');
                setShowPersonaButton(false);
              }}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                backgroundColor: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
                color: '#333',
              }}
            >
              Connect with support specialist
            </button>
          </div>
        )}
        {supportPersona && (
          <div
            style={{
              padding: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: 12,
              fontWeight: 500,
              color: '#3b82f6',
            }}
          >
            ✓ {supportPersona} connected
          </div>
        )}
        {snapshot.messages.map((message) =>
          message.role === 'system' ? (
            message.task ? (
              <TaskCard
                key={message.id}
                task={message.task}
                onRetryAction={onRetryAction}
                onOpenPath={onOpenPath}
                onConnectCapability={onConnectCapability}
                onNavigateToSettingsConnector={onNavigateToSettingsConnector}
                onOpenTicketBalance={onOpenTicketBalance}
                onPlanDecision={onPlanDecision}
              />
            ) : (
              <div key={message.id} className={styles.systemLineWrap}>
                <div
                  className={`${styles.systemLine} ${message.status === 'streaming' ? styles.systemLineActive : styles.systemLineDone}`}
                >
                  <span className={styles.systemLineIcon}>{message.status === 'streaming' ? '⚙️' : '✓'}</span>
                  <span className={styles.systemLineText}>{message.content}</span>
                </div>
              </div>
            )
          ) : message.role === 'assistant' && message.status !== 'streaming' && !message.content.trim() ? (
            // A finished assistant turn with no narration text at all — the model made a
            // tool call and said nothing alongside it. The real record of what happened
            // already renders as its own TaskCard/system-line entry elsewhere in this same
            // list; rendering an empty "assistant" bubble here would only add a blank box
            // with no information, which is exactly the "I can't see what it's doing"
            // complaint this was fixed for. Skip it outright rather than showing nothing
            // inside a labeled box.
            null
          ) : (
            <React.Fragment key={message.id}>
              {message.role === 'assistant' && message.status !== 'streaming' && isProjectPlanMessage(message.content) ? (
                // A finished project-plan message renders only as the structured
                // card below — never also as a raw markdown-looking text bubble.
                // While still streaming, the raw bubble below is shown instead
                // (the card can't be built from a plan that's mid-generation).
                <ProjectPlanCard
                  content={message.content}
                  onBuild={() => onSendTranscript('Build Project from the approved PROJECT PLAN.')}
                  onModify={() => onSendTranscript('Modify Plan. I want to adjust the PROJECT PLAN before building.')}
                  onAccept={() => onSendTranscript('I approve this plan as written.')}
                  onDeny={() => onSendTranscript('I reject this plan and would like a different approach.')}
                />
              ) : (
                <article
                  className={`${styles.message} ${message.role === 'assistant' ? styles.assistant : styles.user}`}
                >
                  <div className={styles.messageHeader}>
                    <span className={styles.role}>{message.role}</span>
                    {message.role === 'assistant' && message.status !== 'streaming' && message.content.trim() && (
                      <button className={styles.speakMessageBtn} onClick={() => onSpeakMessage(message.content)} type="button">
                        Speak
                      </button>
                    )}
                  </div>
                  <div className={message.status === 'streaming' ? styles.streaming : ''}>{message.content}</div>
                </article>
              )}
            </React.Fragment>
          )
        )}
        {snapshot.draftTranscript && snapshot.state === 'listening' && (
          <article className={`${styles.message} ${styles.user}`}>
            <div className={styles.role}>user</div>
            <div className={styles.streaming}>{snapshot.draftTranscript}</div>
          </article>
        )}
        {!snapshot.draftTranscript && latestMessage?.role === 'assistant' && snapshot.state === 'speaking' && (
          <div className={styles.speakingHint}>Speaking response...</div>
        )}
      </div>

      {snapshot.errorMessage && <div className={styles.error}>{snapshot.errorMessage}</div>}
      {attachError && <div className={styles.error}>{attachError}</div>}

      <div className={styles.composer}>
        <input
          ref={fileInputRef}
          type="file"
          accept={[...SUPPORTED_FILE_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS].join(',')}
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFileChosen(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className={styles.attachBtn}
          onClick={handleAttachClick}
          title="Attach a text file or reference image for Paw to read"
          aria-label="Attach a file or image"
        >
          📎
        </button>
        <div className={styles.modePickerWrap} ref={modeMenuRef}>
          <button
            type="button"
            className={styles.modePickerBtn}
            onClick={() => setModeMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={modeMenuOpen}
            title="Execution mode — controls when Paw asks before acting"
          >
            <span>{activeModeDescriptor.label}</span>
            <span className={styles.modePickerChevron}>{modeMenuOpen ? '▴' : '▾'}</span>
          </button>
          {modeMenuOpen && (
            <div className={styles.modePickerMenu} role="listbox">
              {EXECUTION_MODE_CATALOG.map((mode) => {
                const disabled = mode.id === 'bypass' && !bypassPermissionsEnabled;
                const selected = mode.id === activeExecutionMode;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabled}
                    className={`${styles.modePickerOption} ${selected ? styles.modePickerOptionSelected : ''}`}
                    onClick={() => {
                      if (disabled) return;
                      onSetExecutionMode?.(mode.id);
                      setModeMenuOpen(false);
                    }}
                  >
                    <span className={styles.modePickerOptionCheck}>{selected ? '✓' : ''}</span>
                    <span className={styles.modePickerOptionText}>
                      <span className={styles.modePickerOptionLabel}>{mode.label}</span>
                      <span className={styles.modePickerOptionDesc}>
                        {disabled ? 'Enable in Settings → Advanced' : mode.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className={styles.modelPickerWrap} ref={modelMenuRef}>
          <button
            type="button"
            className={styles.modelPickerBtn}
            onClick={() => setModelMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={modelMenuOpen}
            title="Model — which Paw model answers this conversation"
          >
            <span>{activePawModelDescriptor.label}</span>
            <span className={styles.modelPickerChevron}>{modelMenuOpen ? '▴' : '▾'}</span>
          </button>
          {modelMenuOpen && (() => {
            const exhaustionAction = entitlement
              ? getExhaustionPrimaryActions(entitlement.tier, entitlement.seatTier, entitlement.pooled, enterpriseContactAvailable ?? false)[0]
              : undefined;
            const exhaustionActionHandlers: Record<string, (() => void) | undefined> = {
              upgrade: onUpgrade,
              buyCompute: onBuyCompute,
              contactSales: onContactSales,
              contactAdmin: onContactAdmin,
              requestMoreCompute: onRequestMoreCompute,
            };
            const reasoningModels = PAW_MODEL_CATALOG.filter((m) => REASONING_PAW_MODEL_IDS.includes(m.id));
            const otherModels = PAW_MODEL_CATALOG.filter((m) => !REASONING_PAW_MODEL_IDS.includes(m.id));
            // One running sequence (1, 2, 3, ...) across both groups, in catalog order — a stable
            // quick-reference number per model, not per-group numbering that would restart at 1 twice.
            const modelNumber = new Map(PAW_MODEL_CATALOG.map((m, i) => [m.id, i + 1]));
            return (
              <div className={styles.modelPickerMenu} role="listbox">
                <div className={styles.modelPickerGroupLabel}>Reasoning models</div>
                {reasoningModels.map((model) => {
                  const state = getModelUiState(model, entitlement);
                  const selected = model.id === activePawModel;
                  const requiredTier = modelTierRequirements?.[model.id];
                  return (
                    <div key={model.id} className={styles.modelPickerOption}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={state !== 'available'}
                        className={`${styles.modelPickerOptionMain} ${selected ? styles.modelPickerOptionSelected : ''} ${
                          state !== 'available' ? styles.modelPickerOptionLocked : ''
                        }`}
                        onClick={() => {
                          if (state !== 'available') return;
                          onSelectModel?.(model.id);
                          setModelMenuOpen(false);
                        }}
                      >
                        <span className={styles.modelPickerOptionCheck}>{selected ? '✓' : ''}</span>
                        <span className={styles.modelPickerOptionText}>
                          <span className={styles.modelPickerOptionLabel}>{model.label}</span>
                          <span className={styles.modelPickerOptionDesc}>
                            {state === 'locked' && `🔒 ${formatTierLabel(requiredTier ?? 'pro')} required`}
                            {state === 'exhausted' && 'Usage limit reached'}
                            {state === 'available' && model.description}
                          </span>
                        </span>
                        <span className={styles.modelPickerOptionNumber}>{modelNumber.get(model.id)}</span>
                      </button>
                      {state === 'locked' && (
                        <button
                          type="button"
                          className={styles.modelPickerOptionAction}
                          onClick={() => {
                            onUpgrade?.();
                            setModelMenuOpen(false);
                          }}
                        >
                          Upgrade
                        </button>
                      )}
                      {state === 'exhausted' && exhaustionAction && (
                        <button
                          type="button"
                          className={styles.modelPickerOptionAction}
                          onClick={() => {
                            exhaustionActionHandlers[exhaustionAction.id]?.();
                            setModelMenuOpen(false);
                          }}
                        >
                          {exhaustionAction.label}
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className={styles.modelPickerGroupLabel}>Other Paw models</div>
                {otherModels.map((model) => {
                  const state = getModelUiState(model, entitlement);
                  const requiredTier = modelTierRequirements?.[model.id];
                  return (
                    <div key={model.id} className={`${styles.modelPickerOption} ${styles.modelPickerOptionStatic}`}>
                      <span className={styles.modelPickerOptionText}>
                        <span className={styles.modelPickerOptionLabel}>{model.label}</span>
                        <span className={styles.modelPickerOptionDesc}>{model.description}</span>
                      </span>
                      <span
                        className={`${styles.modelPickerBadge} ${
                          state === 'available' ? styles.modelPickerBadgeAvailable : styles.modelPickerBadgeMuted
                        }`}
                      >
                        {state === 'locked' && `🔒 ${formatTierLabel(requiredTier ?? 'pro')} required`}
                        {state === 'exhausted' && 'Usage limit reached'}
                        {state === 'available' && 'Available'}
                      </span>
                      <span className={styles.modelPickerOptionNumber}>{modelNumber.get(model.id)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <textarea
          ref={textareaRef}
          className={styles.input}
          rows={1}
          autoFocus
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (!event.target.value) setWasPasted(false);
            resizeTextarea();
          }}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Type, or record speech then review before sending"
        />
        <button className={styles.sendBtn} onClick={send} type="button">
          Send
        </button>
      </div>
    </section>
  );
}
