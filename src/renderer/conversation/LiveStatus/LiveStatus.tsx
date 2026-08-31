import React, { useState, useEffect } from 'react';
import styles from './liveStatus.module.css';

type StatusType = 'thinking' | 'running-tools' | 'running-commands' | 'computing' | 'idle';

interface LiveStatusProps {
  status?: StatusType;
  isActive?: boolean;
  pawComputesUsed?: number;
  elapsedSeconds?: number;
  message?: string;
}

const statusMessages: Record<StatusType, string> = {
  'thinking': 'Thinking some more...',
  'running-tools': 'Running tools',
  'running-commands': 'Running commands',
  'computing': 'Computing...',
  'idle': 'Ready',
};

export function LiveStatus({
  status = 'idle',
  isActive = false,
  pawComputesUsed = 0,
  elapsedSeconds = 0,
  message,
}: LiveStatusProps) {
  const [displayMessage, setDisplayMessage] = useState(message || statusMessages[status]);

  useEffect(() => {
    setDisplayMessage(message || statusMessages[status]);
  }, [status, message]);

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  if (!isActive && status === 'idle') {
    return null;
  }

  return (
    <div className={`${styles.container} ${isActive ? styles.active : ''}`}>
      <div className={styles.indicator}>
        <svg
          className={`${styles.icon} ${isActive ? styles.pulse : ''}`}
          viewBox="0 0 24 24"
          width="16"
          height="16"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {/* Globe icon */}
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </div>

      <div className={styles.content}>
        <div className={styles.message}>{displayMessage}</div>
        <div className={styles.details}>
          {elapsedSeconds > 0 && (
            <>
              <span>{formatElapsed(elapsedSeconds)}</span>
              {pawComputesUsed > 0 && <span>·</span>}
            </>
          )}
          {pawComputesUsed > 0 && (
            <span>
              {pawComputesUsed.toFixed(2)} PC
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
