import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './conversationPanel.module.css';
import type { ConversationSnapshot, SubmittedInputContext } from './ConversationTypes';
import { conversationStateLabels } from './ConversationTypes';
import { TaskCard } from './TaskCard';
import { ProjectPlanCard } from './ProjectPlanCard';
import { isProjectPlanMessage } from './ProjectPlanningUX';
import { CreditsRequiredNotice } from '../ui/billing/CreditsRequiredNotice';
import type { SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';

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
}) {
  const [draft, setDraft] = useState('');
  const [wasPasted, setWasPasted] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lastSyncedVoiceDraftRef = useRef('');

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
