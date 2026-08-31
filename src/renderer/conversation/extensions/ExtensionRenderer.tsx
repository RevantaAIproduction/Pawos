import React from 'react';
import type { MessageExtension, ExtensionType, ExtensionExpandRequest } from './ExtensionTypes';
import { PermissionExtensionCard } from './components/PermissionExtensionCard';
import { TaskProgressExtensionCard } from './components/TaskProgressExtensionCard';
import { FileChangeExtensionCard } from './components/FileChangeExtensionCard';
import { MarkdownPreviewExtensionCard } from './components/MarkdownPreviewExtensionCard';
import { BrowserPreviewExtensionCard } from './components/BrowserPreviewExtensionCard';
import { DownloadProgressExtensionCard } from './components/DownloadProgressExtensionCard';
import { AgentStatusExtensionCard } from './components/AgentStatusExtensionCard';
import { ResultReviewCard } from './components/ResultReviewCard';
import { FinalizationCard } from './components/FinalizationCard';
import { PlatformExtensionCard } from './components/PlatformExtensionCard';
import { AnalysisExtensionCard } from './components/AnalysisExtensionCard';
import styles from './extensions.module.css';

export interface ExtensionRendererProps {
  extensions?: MessageExtension[];
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Renders all inline message extensions for a single message.
 * Extensions are compact, live-updating cards embedded in chat.
 */
export function ExtensionRenderer({ extensions, onExpand, onAction }: ExtensionRendererProps) {
  if (!extensions || extensions.length === 0) return null;

  return (
    <div className={styles.extensionsContainer}>
      {extensions.map((ext) => (
        <div key={ext.id} className={styles.extensionWrapper}>
          <ExtensionCard
            extension={ext}
            onExpand={onExpand}
            onAction={onAction}
          />
        </div>
      ))}
    </div>
  );
}

interface ExtensionCardProps {
  extension: MessageExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

function ExtensionCard({ extension, onExpand, onAction }: ExtensionCardProps) {
  switch (extension.type) {
    case 'permission':
      return (
        <PermissionExtensionCard
          extension={extension}
          onAction={onAction}
        />
      );

    case 'task-progress':
      return (
        <TaskProgressExtensionCard
          extension={extension}
          onExpand={onExpand}
          onAction={onAction}
        />
      );

    case 'file-change':
      return (
        <FileChangeExtensionCard
          extension={extension}
          onExpand={onExpand}
          onAction={onAction}
        />
      );

    case 'markdown-preview':
      return (
        <MarkdownPreviewExtensionCard
          extension={extension}
          onExpand={onExpand}
          onAction={onAction}
        />
      );

    case 'browser-preview':
      return (
        <BrowserPreviewExtensionCard
          extension={extension}
          onExpand={onExpand}
          onAction={onAction}
        />
      );

    case 'download-progress':
      return (
        <DownloadProgressExtensionCard
          extension={extension}
          onAction={onAction}
        />
      );

    case 'agent-status':
      return (
        <AgentStatusExtensionCard
          extension={extension}
          onExpand={onExpand}
          onAction={onAction}
        />
      );

    case 'live-status':
      return (
        <div className={styles.extensionCard}>
          <span className={styles.statusText}>{extension.status}</span>
        </div>
      );

    case 'result-review':
      return (
        <ResultReviewCard
          extension={extension}
          onAction={onAction}
        />
      );

    case 'finalization':
      return (
        <FinalizationCard
          extension={extension}
          onAction={onAction}
        />
      );

    case 'analysis':
      return (
        <AnalysisExtensionCard
          extension={extension as any}
          onAction={onAction}
        />
      );

    // Platform extensions (Jira, Linear, GitHub, Git, Slack, Teams, Email, etc.)
    case 'jira-ticket':
    case 'linear-ticket':
    case 'github-issue':
    case 'git-commit':
    case 'git-branch':
    case 'git-diff':
    case 'pull-request':
    case 'code-review':
    case 'code-comment':
    case 'slack-message':
    case 'teams-message':
    case 'email':
    case 'discord-message':
    case 'meeting':
    case 'recording':
    case 'transcription':
    case 'meeting-summary':
    case 'calendar-event':
    case 'project-task':
    case 'file-upload':
    case 'build':
    case 'deployment':
    case 'webhook-event':
      return (
        <PlatformExtensionCard
          extension={extension as any}
          onExpand={onExpand}
          onAction={onAction}
        />
      );

    default:
      return null;
  }
}
