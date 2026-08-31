import React from 'react';
import type { DownloadProgressExtension } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface DownloadProgressExtensionCardProps {
  extension: DownloadProgressExtension;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Download/progress extension — shows file transfers, builds, etc.
 * Displays progress bar with speed and ETA
 */
export function DownloadProgressExtensionCard({
  extension,
  onAction,
}: DownloadProgressExtensionCardProps) {
  const getStatusIcon = () => {
    switch (extension.state) {
      case 'queued':
        return '⏱️';
      case 'downloading':
        return '⬇️';
      case 'paused':
        return '⏸️';
      case 'completed':
        return '✓';
      case 'failed':
        return '⚠️';
      case 'cancelled':
        return '✕';
      default:
        return '?';
    }
  };

  const isActive = extension.state === 'downloading';
  const canPause = extension.state === 'downloading';
  const canResume = extension.state === 'paused';

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>{extension.name}</div>
          {extension.status && (
            <div className={styles.description}>{extension.status}</div>
          )}
          {isActive || extension.state === 'paused' ? (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(100, extension.progress)}%` }}
                />
              </div>
              <div className={styles.downloadInfo}>
                <span>{Math.round(extension.progress)}%</span>
                {extension.downloaded && extension.totalSize && (
                  <span>
                    {extension.downloaded} / {extension.totalSize}
                  </span>
                )}
                {extension.speed && (
                  <span className={styles.speedInfo}>{extension.speed}</span>
                )}
                {extension.eta && (
                  <span className={styles.speedInfo}>{formatEta(extension.eta)}</span>
                )}
              </div>
            </>
          ) : null}
          {extension.errors && extension.errors.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {extension.errors.map((error, i) => (
                <div
                  key={i}
                  className={styles.description}
                  style={{ color: 'rgba(255, 100, 100, 0.8)' }}
                >
                  {error}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.extensionCardControls}>
        {canPause && (
          <button
            className={styles.actionButton}
            onClick={() => onAction?.(extension.id, 'pause')}
          >
            Pause
          </button>
        )}
        {canResume && (
          <button
            className={styles.actionButton}
            onClick={() => onAction?.(extension.id, 'resume')}
          >
            Resume
          </button>
        )}
        {(canPause || canResume) && (
          <button
            className={`${styles.actionButton} ${styles.danger}`}
            onClick={() => onAction?.(extension.id, 'cancel')}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s left`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m left`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m left`;
}
