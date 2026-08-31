import React from 'react';
import type { BrowserPreviewExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface BrowserPreviewExtensionCardProps {
  extension: BrowserPreviewExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Browser preview extension — shows live downloads, page previews, etc.
 * Can display download progress or page preview
 */
export function BrowserPreviewExtensionCard({
  extension,
  onExpand,
  onAction,
}: BrowserPreviewExtensionCardProps) {
  const getStatusIcon = () => {
    switch (extension.state) {
      case 'loading':
        return '⏳';
      case 'loaded':
        return '✓';
      case 'downloading':
        return '⬇️';
      case 'error':
        return '⚠️';
      default:
        return '?';
    }
  };

  const isDownloading = extension.state === 'downloading';

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>
            {extension.title || 'Browser activity'}
          </div>
          {extension.url && (
            <div className={styles.description} style={{ fontFamily: 'monospace', fontSize: 10 }}>
              {extension.url.length > 50
                ? extension.url.slice(0, 47) + '...'
                : extension.url}
            </div>
          )}
          {isDownloading && extension.downloadProgress && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.min(
                      100,
                      (extension.downloadProgress.current / extension.downloadProgress.total) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className={styles.downloadInfo}>
                <span>
                  {formatBytes(extension.downloadProgress.current)} /
                  {extension.downloadProgress.total > 0
                    ? ' ' + formatBytes(extension.downloadProgress.total)
                    : ''}
                </span>
                {extension.downloadProgress.speed && (
                  <span className={styles.speedInfo}>
                    {extension.downloadProgress.speed}
                  </span>
                )}
                {extension.downloadProgress.eta && (
                  <span className={styles.speedInfo}>
                    {formatEta(extension.downloadProgress.eta)}
                  </span>
                )}
              </div>
            </>
          )}
          {extension.preview && (
            <div className={styles.previewContainer} style={{ maxHeight: 120 }}>
              <div className={styles.previewContent}>{extension.preview}</div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.extensionCardControls}>
        <button
          className={styles.expandButton}
          title="Expand to Browser"
          onClick={() =>
            onExpand?.({
              extensionId: extension.id,
              extensionType: 'browser-preview',
              target: 'browser',
              payload: {
                url: extension.url,
                preview: extension.preview,
              },
            })
          }
        >
          ↗
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
