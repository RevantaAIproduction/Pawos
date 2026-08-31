import React from 'react';
import type { MessageExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import type { PlatformExtension } from '../PlatformExtensionTypes';
import styles from '../extensions.module.css';

interface PlatformExtensionCardProps {
  extension: PlatformExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Universal platform extension renderer
 * Handles all integrated platforms: Jira, Linear, GitHub, Git, Slack, Teams, Email, etc.
 */
export function PlatformExtensionCard({ extension, onExpand, onAction }: PlatformExtensionCardProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
      case 'scheduled':
      case 'pending':
      case 'draft':
      case 'recording':
      case 'uploading':
      case 'queued':
        return '⏳';
      case 'in-progress':
      case 'processing':
      case 'recording-paused':
        return '⚙️';
      case 'in-review':
      case 'review':
      case 'approved':
      case 'sent':
        return '👁️';
      case 'done':
      case 'closed':
      case 'merged':
      case 'deployed':
      case 'passed':
      case 'ready':
      case 'complete':
        return '✓';
      case 'failed':
      case 'cancelled':
        return '⚠️';
      default:
        return '→';
    }
  };

  const getTitle = (ext: PlatformExtension) => {
    switch (ext.type) {
      case 'jira-ticket':
        return `${ext.projectKey}-${ext.ticketId}: ${ext.title}`;
      case 'linear-ticket':
        return `[${ext.teamKey}] ${ext.title}`;
      case 'github-issue':
        return `#${ext.issueNumber}: ${ext.title}`;
      case 'pull-request':
        return `PR #${ext.prNumber}: ${ext.title}`;
      case 'git-commit':
        return `Commit: ${ext.message}`;
      case 'git-branch':
        return `Branch: ${ext.branchName}`;
      case 'code-review':
        return `Code Review`;
      case 'code-comment':
        return `Comment: ${ext.text.slice(0, 50)}...`;
      case 'slack-message':
        return `Slack #${ext.channelName}`;
      case 'teams-message':
        return `Teams #${ext.channelName}`;
      case 'email':
        return `Email: ${ext.subject}`;
      case 'discord-message':
        return `Discord #${ext.channelName}`;
      case 'meeting':
        return `Meeting: ${ext.title}`;
      case 'recording':
        return `Recording: ${ext.title}`;
      case 'transcription':
        return `Transcription: ${ext.title}`;
      case 'meeting-summary':
        return `Summary: ${ext.title}`;
      case 'calendar-event':
        return `Event: ${ext.title}`;
      case 'project-task':
        return `Task: ${ext.title}`;
      case 'file-upload':
        return `Uploaded: ${ext.fileName}`;
      case 'build':
        return `Build: ${ext.buildName}`;
      case 'deployment':
        return `Deploy: ${ext.service} → ${ext.environment}`;
      default:
        return 'Platform Activity';
    }
  };

  const getStatusLabel = (ext: PlatformExtension) => {
    if ('status' in ext && typeof ext.status === 'string') {
      return ext.status.replace(/-/g, ' ').toUpperCase();
    }
    return 'ACTIVE';
  };

  const getMetadata = (ext: PlatformExtension) => {
    const metadata = [];

    if ('assignee' in ext && ext.assignee) {
      metadata.push(`Assigned to ${ext.assignee}`);
    }
    if ('priority' in ext && ext.priority) {
      metadata.push(`Priority: ${ext.priority}`);
    }
    if ('author' in ext && ext.author) {
      metadata.push(`By ${ext.author}`);
    }
    if ('filesChanged' in ext && ext.filesChanged) {
      metadata.push(`${ext.filesChanged} files changed`);
    }
    if ('commitCount' in ext && ext.commitCount) {
      metadata.push(`${ext.commitCount} commits`);
    }
    if ('progress' in ext && typeof ext.progress === 'number') {
      metadata.push(`${ext.progress}% complete`);
    }
    if ('duration' in ext && ext.duration) {
      const mins = Math.round(ext.duration / 60);
      metadata.push(`${mins} min`);
    }

    return metadata;
  };

  const title = getTitle(extension);
  const status = getStatusLabel(extension);
  const metadata = getMetadata(extension);

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.status]}`}>
          {getStatusIcon(extension.status)}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>
            {extension.type === 'jira-ticket' && '🔗 '}
            {extension.type === 'linear-ticket' && '🎯 '}
            {extension.type === 'github-issue' && '🐙 '}
            {extension.type === 'pull-request' && '🔀 '}
            {extension.type === 'git-commit' && '📝 '}
            {extension.type === 'code-review' && '👁️ '}
            {extension.type === 'slack-message' && '💬 '}
            {extension.type === 'teams-message' && '🏢 '}
            {extension.type === 'email' && '📧 '}
            {extension.type === 'meeting' && '📞 '}
            {extension.type === 'recording' && '🎬 '}
            {extension.type === 'build' && '🔨 '}
            {extension.type === 'deployment' && '🚀 '}
            {title}
          </div>

          {('description' in extension && extension.description) && (
            <div className={styles.description}>{extension.description}</div>
          )}

          {('text' in extension && extension.text && extension.type === 'code-comment') && (
            <div className={styles.description} style={{ fontSize: 11, marginTop: 4 }}>
              "{extension.text}"
            </div>
          )}

          {metadata.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {metadata.map((meta, i) => (
                <span key={i} className={styles.description} style={{ fontSize: 10 }}>
                  {meta}
                </span>
              ))}
            </div>
          )}

          {('progress' in extension && typeof extension.progress === 'number') && (
            <>
              <div className={styles.progressBar} style={{ marginTop: 6 }}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(100, extension.progress)}%` }}
                />
              </div>
            </>
          )}

          {('keyPoints' in extension && extension.keyPoints && extension.keyPoints.length > 0) && (
            <div style={{ marginTop: 6 }}>
              {extension.keyPoints.slice(0, 2).map((point, i) => (
                <div key={i} className={styles.description} style={{ fontSize: 10 }}>
                  • {point}
                </div>
              ))}
              {extension.keyPoints.length > 2 && (
                <div className={styles.description} style={{ fontSize: 10 }}>
                  +{extension.keyPoints.length - 2} more points
                </div>
              )}
            </div>
          )}

          {('actionItems' in extension && extension.actionItems && extension.actionItems.length > 0) && (
            <div style={{ marginTop: 6 }}>
              {extension.actionItems.slice(0, 2).map((item, i) => (
                <div key={i} className={styles.description} style={{ fontSize: 10 }}>
                  ☐ {item.task} {item.owner ? `(${item.owner})` : ''}
                </div>
              ))}
              {extension.actionItems.length > 2 && (
                <div className={styles.description} style={{ fontSize: 10 }}>
                  +{extension.actionItems.length - 2} more actions
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
            {status}
          </div>
        </div>
      </div>

      <div className={styles.extensionCardControls}>
        {('url' in extension && extension.url) && (
          <button
            className={styles.expandButton}
            title="Open in browser"
            onClick={() =>
              onExpand?.({
                extensionId: extension.id,
                extensionType: extension.type as any,
                target: 'browser',
                payload: { url: extension.url },
              })
            }
          >
            ↗
          </button>
        )}
      </div>
    </div>
  );
}
