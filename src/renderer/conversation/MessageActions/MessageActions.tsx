import React from 'react';
import styles from './messageActions.module.css';

interface MessageActionsProps {
  messageId: string;
  onCopy?: () => void;
  onPin?: () => void;
  onChapter?: () => void;
  onWorkFromHere?: () => void;
  onReadAloud?: () => void;
  timestamp?: Date;
}

export function MessageActions({
  messageId,
  onCopy,
  onPin,
  onChapter,
  onWorkFromHere,
  onReadAloud,
  timestamp,
}: MessageActionsProps) {
  const formatTimestamp = (date?: Date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'completed just now';
    if (minutes < 60) return `completed ${minutes}m ago`;
    if (hours < 24) return `completed ${hours}h ago`;
    if (days < 7) return `completed ${days}d ago`;
    return `completed ${date.toLocaleDateString()}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.timestamp}>{formatTimestamp(timestamp)}</div>
      <div className={styles.actions}>
        <button
          className={styles.action}
          onClick={onCopy}
          title="Copy"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 5C9 3.89543 9.89543 3 11 3H17C18.1046 3 19 3.89543 19 5V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className={styles.action}
          onClick={onPin}
          title="Pin"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15 8H21L16.5 12L18 18L12 14.5L6 18L7.5 12L3 8H9L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className={styles.action}
          onClick={onChapter}
          title="Chapter"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          className={styles.action}
          onClick={onWorkFromHere}
          title="Work from here"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className={styles.action}
          onClick={onReadAloud}
          title="Read aloud"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 14C13.6569 14 15 12.6569 15 11V6C15 4.34315 13.6569 3 12 3C10.3431 3 9 4.34315 9 6V11C9 12.6569 10.3431 14 12 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 14H16C17.1046 14 18 14.8954 18 16C18 19.3137 15.3137 22 12 22C8.68629 22 6 19.3137 6 16C6 14.8954 6.89543 14 8 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
