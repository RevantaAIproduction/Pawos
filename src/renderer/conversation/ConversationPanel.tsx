import React, { useMemo, useState } from 'react';
import styles from './conversationPanel.module.css';
import type { ConversationSnapshot } from './ConversationTypes';
import { conversationStateLabels } from './ConversationTypes';

export function ConversationPanel({
  snapshot,
  onClose,
  onStartListening,
  onSendTranscript,
}: {
  snapshot: ConversationSnapshot;
  onClose: () => void;
  onStartListening: () => void;
  onSendTranscript: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const stateLabel = conversationStateLabels[snapshot.state];
  const latestMessage = useMemo(() => snapshot.messages[snapshot.messages.length - 1], [snapshot.messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    onSendTranscript(text);
    setDraft('');
  };

  return (
    <section className={styles.panel} aria-label="Conversation panel">
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Conversation</div>
          <div className={styles.title}>{stateLabel}</div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.listenBtn} onClick={onStartListening} type="button">
            {snapshot.state === 'listening'
              ? 'Listening'
              : snapshot.state === 'waitingForPermission' || snapshot.state === 'error'
                ? 'Retry'
                : 'Listen'}
          </button>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            Close
          </button>
        </div>
      </header>

      <div className={styles.meta}>
        <span>{snapshot.supportsSpeechRecognition ? 'Speech recognition ready' : 'Type mode fallback'}</span>
        <span>{snapshot.supportsSpeechSynthesis ? 'Speech synthesis ready' : 'Speech output fallback'}</span>
      </div>

      <div className={styles.transcript} role="log" aria-live="polite" aria-relevant="additions text">
        {snapshot.messages.length === 0 && (
          <div className={styles.emptyState}>No conversation yet. Activate listening or type a message.</div>
        )}
        {snapshot.messages.map((message) => (
          <article
            key={message.id}
            className={`${styles.message} ${message.role === 'assistant' ? styles.assistant : styles.user}`}
          >
            <div className={styles.role}>{message.role}</div>
            <div className={message.status === 'streaming' ? styles.streaming : ''}>{message.content}</div>
          </article>
        ))}
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

      <div className={styles.composer}>
        <input
          className={styles.input}
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Type a message if speech input is unavailable"
        />
        <button className={styles.sendBtn} onClick={send} type="button">
          Send
        </button>
      </div>
    </section>
  );
}
