import React from 'react';
import type { MarkdownPreviewExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface MarkdownPreviewExtensionCardProps {
  extension: MarkdownPreviewExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Markdown/content preview extension — shows structured content inline
 * Truncates with expand option for full view
 */
export function MarkdownPreviewExtensionCard({
  extension,
  onExpand,
  onAction,
}: MarkdownPreviewExtensionCardProps) {
  const maxHeight = extension.maxHeight || 150;
  const preview = extension.truncated
    ? extension.content.slice(0, 200) + '...'
    : extension.content;

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={styles.extensionCardContent}>
          {extension.title && <div className={styles.title}>{extension.title}</div>}
          <div className={styles.previewContainer} style={{ maxHeight }}>
            <div className={styles.previewContent}>
              {preview}
            </div>
          </div>
          {extension.truncated && (
            <div className={styles.description} style={{ marginTop: 6 }}>
              Preview truncated
            </div>
          )}
        </div>
      </div>
      {extension.truncated && (
        <div className={styles.extensionCardControls}>
          <button
            className={styles.expandButton}
            title="Show full content"
            onClick={() =>
              onExpand?.({
                extensionId: extension.id,
                extensionType: 'markdown-preview',
                target: 'browser',
                payload: {
                  content: extension.content,
                  title: extension.title,
                },
              })
            }
          >
            ↗
          </button>
        </div>
      )}
    </div>
  );
}
