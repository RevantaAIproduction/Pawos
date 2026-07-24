import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './app.module.css';
import { Avatar3DOverlay } from './CompanionCanvas/Avatar3DOverlay';
import { SettingsPanel } from './SettingsPanel/SettingsPanel';
import { ConversationPanel } from '../conversation/ConversationPanel';
import { WorkspaceRuntime } from '../workspace/WorkspaceRuntime';
import { CommunicationWorkspaceRuntime } from '../communication/CommunicationWorkspaceRuntime';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import { useCompanionController } from '../companion/useCompanionController';
import { useCompanionProfiles } from '../companion/manager/useCompanionProfiles';
import { buildPersonalityAddendum } from '../companion/manager/CompanionProfileTypes';
import { useConversationController } from '../conversation/useConversationController';
import { PAW_SYSTEM_PROMPT } from '../conversation/systemPrompt';
import { aiProviderConfigStore } from '../ai/AIProviderConfigStore';
import type { VisemeFrame } from '../conversation/LipSyncTypes';
// [DEBUG-TEMP] remove this import and its usage below once real-mic verification is done.
import { VoiceDebugPanel } from './VoiceDebugPanel';

export default function CompanionExperience() {
  const ipc = useIpcBridge();
  // Runtime 10: the 3D stack (Avatar3DOverlay -> CompanionRuntime in
  // companion/core/) is now the sole rendered companion. The legacy 2D
  // controller below is kept only as a dormant compatibility layer — since
  // AvatarCanvas (the only thing that ever called controller.attachCanvas)
  // is no longer mounted, CompanionApp/the 2D runtime loop/keyboard&mouse
  // hooks never start. What's left in active use is the IPC command bridge
  // (setEmotion/setMood/setContext/setConversationState/applySettings),
  // which Avatar3DOverlay's EmotionController reads as an idle-time
  // override — every method here is already null-safe (`app?.`) with no
  // canvas attached. Retire this hook entirely once that bridge is ported
  // to the 3D stack directly.
  const controller = useCompanionController();
  const visemeRef = useRef<VisemeFrame | null>(null);
  const conversation = useConversationController({
    onStateChange: (state) => controller.controller?.setConversationState(state),
    onVisemeFrame: (frame) => {
      visemeRef.current = frame;
    },
  });
  const conversationSnapshot = conversation.snapshot;

  // Personality preset/custom addendum (see CompanionProfileTypes.ts) is
  // layered onto the base system prompt whenever the active companion's
  // personality changes — the one real behavioral effect of a preset choice,
  // not just a label shown in a list.
  const { active: activeProfile, markUploadRigged } = useCompanionProfiles();
  useEffect(() => {
    if (!activeProfile) return;
    const parts = [buildPersonalityAddendum(activeProfile.personality)];
    if (activeProfile.behavior.interactionStyle.trim()) parts.push(activeProfile.behavior.interactionStyle.trim());
    const addendum = parts.filter(Boolean).join(' ');
    conversation.setReasoningSystemPrompt(addendum ? `${PAW_SYSTEM_PROMPT}\n\n${addendum}` : PAW_SYSTEM_PROMPT);
  }, [activeProfile, conversation.setReasoningSystemPrompt]);

  // Same real-wiring gap as personality above: CompanionProfile.voice
  // (provider/voiceId/speed) previously had no effect on anything — the TTS
  // provider was hard-coded to 'browser' inside useConversationController.
  // Reusing an already-configured reasoning API key for the matching TTS
  // provider (same pattern as the Gemini STT key reuse a few lines up in
  // that hook) since there's no separate per-feature key store.
  useEffect(() => {
    if (!activeProfile) return;
    const { ttsProvider, voiceId, speed, pitch, style } = activeProfile.voice;
    const apiKey = ttsProvider === 'openai' ? aiProviderConfigStore.getApiKey('openai') : undefined;
    conversation.setSpeechSynthesisProvider({ id: ttsProvider, voiceId, speed, pitch, style, apiKey });
  }, [activeProfile, conversation.setSpeechSynthesisProvider]);

  // Workspace Runtime — the currently-running task, if any, is the same
  // data ConversationPanel/TaskCard already derive from the snapshot; no
  // new tracking, just reading the same messages array for the most
  // recent task still in progress.
  const activeTask = useMemo(() => {
    const messages = conversationSnapshot.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const task = messages[i].task;
      if (task && task.status === 'running') return task;
    }
    return undefined;
  }, [conversationSnapshot.messages]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const notifyOnTaskCompleteRef = useRef(true);

  const FIRST_LAUNCH_KEY = 'pawos:firstLaunchCompleted';
  const welcomeMessage =
    "Hi, I'm PawOS.\n\nI'm your personal AI companion.\n\nI'm here to keep you company and help you get things done.\n\nWhenever you're ready, tell me what you're working on today.";

  const controllerRef = useRef(controller.controller);
  controllerRef.current = controller.controller;
  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = conversationSnapshot.state === 'speaking';
  const conversationStateRef = useRef(conversationSnapshot.state);
  conversationStateRef.current = conversationSnapshot.state;
  const workspaceActiveRef = useRef(false);
  const celebrateUntilRef = useRef(0);
  const celebratedTaskIdsRef = useRef<Set<string>>(new Set());
  const isInteractiveRef = useRef(false);

  useEffect(() => {
    // Backend command relay: lets any window (e.g. the dashboard) command
    // this, the one companion, without holding a direct reference to it.
    // Subscribes once (ipc is stable); always dispatches to the latest
    // controller via the ref, so this never re-subscribes as the
    // controller itself becomes ready.
    ipc.onCompanionCommand((command) => {
      const c = controllerRef.current;
      if (!c) return;
      switch (command.type) {
        case 'setEmotion':
          c.setEmotion(command.expression);
          break;
        case 'playAnimation':
          c.playAnimation(command.clip);
          break;
        case 'lookAt':
          c.lookAt(command.target);
          break;
        case 'setMood':
          c.setMood(command.mood);
          break;
        case 'setContext':
          c.setContext(command.context);
          break;
        case 'openConversation':
          conversation.open();
          if (command.prefill) conversation.submitTranscript(command.prefill);
          break;
      }
    });
  }, [ipc, conversation.open, conversation.submitTranscript]);

  useEffect(() => {
    ipc.onUiOpenSettings(() => setSettingsOpen(true));
    ipc.onSettingsUpdated((s) => {
      controller.applySettings(s);
      notifyOnTaskCompleteRef.current = s.notifyOnTaskComplete;
    });

    ipc.getSettings().then((s) => {
      controller.applySettings(s);
      notifyOnTaskCompleteRef.current = s.notifyOnTaskComplete;
    });
    ipc.petsList().then((list) => controller.setPetList(list));

    // First launch welcome experience:
    // - Open conversation panel
    // - Speak welcome message (speech-only)
    // - Do NOT start speech recognition
    // - Persist flag so it happens only once (after speak)
    void (async () => {
      try {
        const alreadyCompleted = window.localStorage.getItem(FIRST_LAUNCH_KEY) === 'true';
        if (alreadyCompleted) return;

        conversation.open();
        void conversation.speak(welcomeMessage);
        window.localStorage.setItem(FIRST_LAUNCH_KEY, 'true');
      } catch {
        // ignore first-launch UX if storage or speech isn't available
      }
    })();
  }, [ipc, controller.applySettings, controller.setPetList]);

  useEffect(() => {
    controller.controller?.setConversationPanelOpen(conversationSnapshot.panelOpen);
  }, [controller.controller, conversationSnapshot.panelOpen]);

  // The workspace panel appears/disappears (mounts, doesn't resize the
  // window) exactly when a task starts/stops running — the "temporary
  // workspace... disappears when work is finished" behavior.
  // Gated on the panel being open too, not just a running task — "keep it
  // close, only open when needed": if the user closes the chat, the
  // workspace collapses immediately regardless of what's still running in
  // the background, rather than staying expanded unattended.
  const isWorkspaceActive = Boolean(activeTask) && conversationSnapshot.panelOpen;
  workspaceActiveRef.current = isWorkspaceActive;

  // Celebrate on completion: the companion's own CELEBRATING clip, timed to
  // match CompanionRuntime's 2500ms 'celebrating' duration — the only live
  // trigger path into that state (CompanionGesture has no 'celebrating'
  // entry). Scans the same messages array already driving activeTask; marks
  // each task celebrated once so a re-render doesn't restart the timer.
  useEffect(() => {
    for (const message of conversationSnapshot.messages) {
      const task = message.task;
      if (task && task.status === 'completed' && !celebratedTaskIdsRef.current.has(task.id)) {
        celebratedTaskIdsRef.current.add(task.id);
        celebrateUntilRef.current = Date.now() + 2500;

        // Desktop Companion notification reaction: a real OS notification
        // (Electron's own Notification API) only when the user wasn't
        // actually looking at this window — document.hasFocus() is real,
        // not simulated. Never fires while the user is already watching
        // the companion celebrate.
        if (!document.hasFocus() && notifyOnTaskCompleteRef.current) {
          void ipc.showCompanionNotification('Paw finished a task', task.goal);
        }
      }
    }
  }, [conversationSnapshot.messages, ipc]);

  // The desktop always remains the user's desktop: the overlay window is
  // click-through by default (main.ts), and only becomes interactive while
  // the cursor is actually over real, visible content in this window (the
  // avatar, the chat panel, the workspace panel) — never just because the
  // window happens to occupy that screen area. Toggled only on genuine
  // enter/leave transitions, not on every mousemove tick.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overInteractive = Boolean(el?.closest('[data-interactive="true"]'));
      if (overInteractive !== isInteractiveRef.current) {
        isInteractiveRef.current = overInteractive;
        void ipc.setOverlayInteractive(overInteractive);
      }
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [ipc]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcutPressed =
        (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyC';
      if (shortcutPressed) {
        event.preventDefault();
        conversation.toggle();
        return;
      }

      if (event.code === 'Escape' && conversationSnapshot.panelOpen) {
        event.preventDefault();
        conversation.close();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [conversation.close, conversation.toggle, conversationSnapshot.panelOpen]);

  return (
    <div className={styles.app}>
      <div
        data-interactive="true"
        className={`${styles.avatarShell} ${isWorkspaceActive ? styles.avatarShellCompact : ''}`}
        onDoubleClick={() => setSettingsOpen(true)}
      >
        <Avatar3DOverlay
          controller={controller.controller}
          visemeRef={visemeRef}
          isSpeakingRef={isSpeakingRef}
          conversationStateRef={conversationStateRef}
          workspaceActiveRef={workspaceActiveRef}
          celebrateUntilRef={celebrateUntilRef}
          behavior={activeProfile?.behavior}
          uploadedFilePath={activeProfile?.avatarSource?.mode === 'upload' ? activeProfile.avatarSource.uploadedFilePath : undefined}
          onUploadRigged={(rigged) => activeProfile && markUploadRigged(activeProfile.id, rigged)}
        />
        {!conversationSnapshot.panelOpen && (
          <button
            type="button"
            className={styles.launcher}
            onClick={() => conversation.open()}
          >
            Talk
          </button>
        )}
      </div>
      {conversationSnapshot.panelOpen && (
        <div data-interactive="true">
          <ConversationPanel
            snapshot={conversationSnapshot}
            onClose={() => conversation.close()}
            onStartListening={() => conversation.open()}
            onSendTranscript={(text, context) => conversation.submitTranscript(text, context)}
            onRetryAction={(taskId, actionId) => conversation.retryAction(taskId, actionId)}
            onOpenPath={(path, kind) => conversation.openPath(path, kind)}
            creditsNoticeTier={conversation.creditsNoticeTier}
            onDismissCreditsNotice={() => conversation.dismissCreditsNotice()}
          />
        </div>
      )}
      {isWorkspaceActive && activeTask && (
        <div className={styles.workspaceRuntimeSlot} data-interactive="true">
          <WorkspaceRuntime
            task={activeTask}
            onRetryAction={(taskId, actionId) => conversation.retryAction(taskId, actionId)}
            onOpenPath={(path, kind) => conversation.openPath(path, kind)}
          />
        </div>
      )}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 40 }} data-interactive="true">
        <CommunicationWorkspaceRuntime />
      </div>
      {settingsOpen && (
        <div data-interactive="true">
          <SettingsPanel
            controller={controller.controller}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}
      {/* [DEBUG-TEMP] remove once real-mic verification is done */}
      <VoiceDebugPanel snapshot={conversationSnapshot} />
    </div>
  );
}
