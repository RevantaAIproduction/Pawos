import React from 'react';
import styles from './sessionLimitModal.module.css';

interface SessionLimitModalProps {
  isOpen: boolean;
  onNewChat: () => void;
  onContinueAsNew: () => void;
}

export function SessionLimitModal({ isOpen, onNewChat, onContinueAsNew }: SessionLimitModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} data-interactive="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Session limit reached</h2>
        </div>

        <div className={styles.content}>
          <p className={styles.message}>
            This session has reached the maximum of 80 prompts.
          </p>
          <p className={styles.subtitle}>
            Choose how you want to continue.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={onNewChat}
            type="button"
          >
            New Chat
          </button>
          <button
            className={styles.secondaryButton}
            onClick={onContinueAsNew}
            type="button"
          >
            Continue as New Session
          </button>
        </div>
      </div>
    </div>
  );
}
