/**
 * Message Extension System
 *
 * Inline live interactive cards embedded in chat messages.
 * Extensions display compact inline previews and can expand to the internal
 * right-side tool area (Terminal, WorkTree, Browser).
 *
 * Extensions are reusable, state-aware, and real-time synchronized.
 */

export type ExtensionType =
  | 'permission'
  | 'task-progress'
  | 'file-change'
  | 'markdown-preview'
  | 'browser-preview'
  | 'download-progress'
  | 'agent-status'
  | 'live-status'
  | 'result-review'
  | 'finalization';

export type PermissionExtensionState =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'executing'
  | 'completed'
  | 'failed';

export type TaskProgressExtensionState =
  | 'queued'
  | 'running'
  | 'progress'
  | 'waiting-permission'
  | 'completed'
  | 'failed'
  | 'stopped';

export type FileChangeExtensionState =
  | 'detecting'
  | 'detected'
  | 'staged'
  | 'committed'
  | 'conflict';

export type AgentStatusExtensionState =
  | 'idle'
  | 'running'
  | 'complete'
  | 'error'
  | 'stopped';

export type DownloadProgressExtensionState =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Permission request — inline action card
 * Can transition from pending → approved/denied → executing → completed/failed
 */
export interface PermissionExtension {
  type: 'permission';
  id: string;
  state: PermissionExtensionState;
  title: string;
  description?: string;
  requiredScopes?: string[];
  allowedActions?: ('allow-once' | 'allow-always' | 'deny')[];
  actionId?: string;
  taskId?: string;
  approvalId?: string;
  timestamp: number;
}

/**
 * Task/agent execution progress
 * Inline progress card with real-time status updates
 */
export interface TaskProgressExtension {
  type: 'task-progress';
  id: string;
  taskId: string;
  state: TaskProgressExtensionState;
  goal: string;
  status?: string;
  progress?: number; // 0-100
  currentAction?: string;
  actions?: Array<{
    id: string;
    type: string;
    inProgressText: string;
    doneText?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt?: number;
    endedAt?: number;
  }>;
  timestamp: number;
  expandTarget?: 'browser' | 'terminal' | 'worktree';
}

/**
 * File edits and diffs
 * Shows changed files with color coding (red=removed, green=added, yellow=modifying)
 */
export interface FileChangeExtension {
  type: 'file-change';
  id: string;
  state: FileChangeExtensionState;
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'staged' | 'unstaged';
    additions?: number;
    deletions?: number;
    content?: string;
  }>;
  summary?: string;
  timestamp: number;
  expandTarget?: 'worktree';
}

/**
 * Markdown or structured content preview
 * Inline preview with "show full" expand
 */
export interface MarkdownPreviewExtension {
  type: 'markdown-preview';
  id: string;
  content: string;
  maxHeight?: number;
  truncated?: boolean;
  title?: string;
  timestamp: number;
}

/**
 * Live browser preview (download, web page, etc.)
 * Can show page preview or download progress
 */
export interface BrowserPreviewExtension {
  type: 'browser-preview';
  id: string;
  state: 'loading' | 'loaded' | 'error' | 'downloading';
  url?: string;
  title?: string;
  preview?: string; // HTML snippet or screenshot data
  downloadProgress?: {
    current: number;
    total: number;
    speed?: string;
    eta?: number;
  };
  timestamp: number;
  expandTarget?: 'browser';
}

/**
 * Download or build progress indicator
 * Shows file transfers, builds, deployments, etc.
 */
export interface DownloadProgressExtension {
  type: 'download-progress';
  id: string;
  state: DownloadProgressExtensionState;
  name: string;
  progress: number; // 0-100
  speed?: string;
  eta?: number;
  totalSize?: string;
  downloaded?: string;
  status?: string;
  errors?: string[];
  timestamp: number;
}

/**
 * Agent/service status indicator
 * Shows agent running state with progress bars
 */
export interface AgentStatusExtension {
  type: 'agent-status';
  id: string;
  agentId: string;
  state: AgentStatusExtensionState;
  agentName: string;
  steps?: Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
  }>;
  currentStep?: string;
  totalSteps?: number;
  error?: string;
  timestamp: number;
}

/**
 * Generic live status
 * For real-time state that doesn't fit other types
 */
export interface LiveStatusExtension {
  type: 'live-status';
  id: string;
  status: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Result review — after successful execution completion
 * Allows user to accept result or request changes
 */
export interface ResultReviewExtension {
  type: 'result-review';
  id: string;
  state: 'pending-review' | 'accepted' | 'needs-changes';
  resultSummary: string;
  timestamp: number;
}

/**
 * Finalization controls — after accepting a result
 * Shows context-dependent actions like Save, Commit, Push, Deploy
 */
export interface FinalizationExtension {
  type: 'finalization';
  id: string;
  state: 'waiting-action' | 'executing' | 'completed' | 'failed';
  availableActions: Array<'save' | 'commit' | 'push' | 'deploy' | 'comment' | 'done'>;
  timestamp: number;
}

export type MessageExtension =
  | PermissionExtension
  | TaskProgressExtension
  | FileChangeExtension
  | MarkdownPreviewExtension
  | BrowserPreviewExtension
  | DownloadProgressExtension
  | AgentStatusExtension
  | LiveStatusExtension
  | ResultReviewExtension
  | FinalizationExtension
  | import('./AnalysisExtensionTypes').AnalysisExtension
  | import('./PlatformExtensionTypes').JiraTicketExtension
  | import('./PlatformExtensionTypes').LinearTicketExtension
  | import('./PlatformExtensionTypes').GitHubIssueExtension
  | import('./PlatformExtensionTypes').GitCommitExtension
  | import('./PlatformExtensionTypes').GitBranchExtension
  | import('./PlatformExtensionTypes').GitDiffExtension
  | import('./PlatformExtensionTypes').PullRequestExtension
  | import('./PlatformExtensionTypes').CodeReviewExtension
  | import('./PlatformExtensionTypes').CodeCommentExtension
  | import('./PlatformExtensionTypes').SlackMessageExtension
  | import('./PlatformExtensionTypes').TeamsMessageExtension
  | import('./PlatformExtensionTypes').EmailExtension
  | import('./PlatformExtensionTypes').DiscordMessageExtension
  | import('./PlatformExtensionTypes').MeetingExtension
  | import('./PlatformExtensionTypes').RecordingExtension
  | import('./PlatformExtensionTypes').TranscriptionExtension
  | import('./PlatformExtensionTypes').MeetingSummaryExtension
  | import('./PlatformExtensionTypes').CalendarEventExtension
  | import('./PlatformExtensionTypes').TaskExtension
  | import('./PlatformExtensionTypes').FileUploadExtension
  | import('./PlatformExtensionTypes').BuildExtension
  | import('./PlatformExtensionTypes').DeploymentExtension
  | import('./PlatformExtensionTypes').WebhookEventExtension;

/**
 * Event fired when user wants to expand an extension
 * Opens it in the existing internal right-side tool area
 */
export interface ExtensionExpandRequest {
  extensionId: string;
  extensionType: ExtensionType;
  target: 'browser' | 'terminal' | 'worktree' | 'agents' | 'tasks';
  payload?: Record<string, unknown>;
}
