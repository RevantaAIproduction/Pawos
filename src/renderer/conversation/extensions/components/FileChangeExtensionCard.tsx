import React from 'react';
import type { FileChangeExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface FileChangeExtensionCardProps {
  extension: FileChangeExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * File change extension — shows edited files with color coding
 * Red for removed, green for added, yellow for currently adding/modifying
 */
export function FileChangeExtensionCard({
  extension,
  onExpand,
  onAction,
}: FileChangeExtensionCardProps) {
  const getStatusIcon = () => {
    switch (extension.state) {
      case 'detecting':
        return '🔍';
      case 'detected':
        return '📝';
      case 'staged':
        return '✓';
      case 'committed':
        return '📦';
      case 'conflict':
        return '⚠️';
      default:
        return '?';
    }
  };

  const getFileStatusColor = (status: string) => {
    switch (status) {
      case 'added':
      case 'staged':
        return styles.fileStatus + ' ' + styles.added;
      case 'modified':
      case 'unstaged':
        return styles.fileStatus + ' ' + styles.modified;
      case 'deleted':
        return styles.fileStatus + ' ' + styles.deleted;
      default:
        return styles.fileStatus;
    }
  };

  const fileCount = extension.files.length;
  const addedCount = extension.files.filter((f) => f.status === 'added').length;
  const modifiedCount = extension.files.filter((f) => f.status === 'modified' || f.status === 'unstaged').length;
  const deletedCount = extension.files.filter((f) => f.status === 'deleted').length;

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>Files edited in this session</div>
          <div className={styles.description}>
            {fileCount} file{fileCount !== 1 ? 's' : ''}{' '}
            {addedCount > 0 && <span style={{ color: 'rgba(100, 200, 100, 0.8)' }}>+{addedCount}</span>}
            {modifiedCount > 0 && (
              <span style={{ marginLeft: 6, color: 'rgba(255, 165, 0, 0.8)' }}>~{modifiedCount}</span>
            )}
            {deletedCount > 0 && (
              <span style={{ marginLeft: 6, color: 'rgba(255, 100, 100, 0.8)' }}>-{deletedCount}</span>
            )}
          </div>
          {extension.summary && (
            <div className={styles.description} style={{ marginTop: 4 }}>
              {extension.summary}
            </div>
          )}
          {extension.files.length > 0 && (
            <div className={styles.filesList}>
              {extension.files.slice(0, 4).map((file, i) => (
                <div key={i} className={styles.fileItem}>
                  <div className={getFileStatusColor(file.status)} />
                  <div className={styles.filePath} title={file.path}>
                    {file.path}
                  </div>
                  {(file.additions || file.deletions) && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                      {file.additions && (
                        <span style={{ color: 'rgba(100, 200, 100, 0.7)' }}>+{file.additions}</span>
                      )}
                      {file.deletions && (
                        <span style={{ marginLeft: 4, color: 'rgba(255, 100, 100, 0.7)' }}>
                          -{file.deletions}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {extension.files.length > 4 && (
                <div className={styles.description} style={{ marginTop: 4 }}>
                  +{extension.files.length - 4} more file{extension.files.length - 4 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.extensionCardControls}>
        <button
          className={styles.expandButton}
          title="View in WorkTree"
          onClick={() =>
            onExpand?.({
              extensionId: extension.id,
              extensionType: 'file-change',
              target: 'worktree',
              payload: {
                files: extension.files,
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
