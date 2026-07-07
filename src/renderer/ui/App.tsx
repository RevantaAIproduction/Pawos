import React, { useEffect, useState } from 'react';
import styles from './app.module.css';
import { AvatarCanvas } from './CompanionCanvas/CompanionCanvas';
import { SettingsPanel } from './SettingsPanel/SettingsPanel';
import { ConversationPanel } from '../conversation/ConversationPanel';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import { useCompanionController } from '../companion/useCompanionController';
import { useConversationController } from '../conversation/useConversationController';

export default function App() {
  const ipc = useIpcBridge();
  const controller = useCompanionController();
  const conversation = useConversationController({
    onStateChange: (state) => controller.controller?.setConversationState(state),
  });
  const conversationSnapshot = conversation.snapshot;

  const [settingsOpen, setSettingsOpen] = useState(false);

  const FIRST_LAUNCH_KEY = 'pawos:firstLaunchCompleted';
  const welcomeMessage =
    "Hi, I'm PawOS.\n\nI'm your personal AI companion.\n\nI'm here to keep you company and help you get things done.\n\nWhenever you're ready, tell me what you're working on today.";

  useEffect(() => {
    ipc.onUiOpenSettings(() => setSettingsOpen(true));
    ipc.onSettingsUpdated((s) => controller.applySettings(s));

    ipc.getSettings().then((s) => controller.applySettings(s));
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
      <div className={styles.avatarShell}>
        <AvatarCanvas
          controller={controller.controller}
          onRequestOpenSettings={() => setSettingsOpen(true)}
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
        <ConversationPanel
          snapshot={conversationSnapshot}
          onClose={() => conversation.close()}
          onStartListening={() => conversation.open()}
          onSendTranscript={(text) => conversation.submitTranscript(text)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          controller={controller.controller}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

