/**
 * Message Extension Helpers
 *
 * Utility functions for creating and managing message extensions.
 * Used by ConversationRuntime and task handlers to attach extensions to messages.
 */

import type {
  MessageExtension,
  PermissionExtension,
  TaskProgressExtension,
  FileChangeExtension,
  MarkdownPreviewExtension,
  BrowserPreviewExtension,
  DownloadProgressExtension,
  AgentStatusExtension,
  PermissionExtensionState,
  TaskProgressExtensionState,
  FileChangeExtensionState,
  AgentStatusExtensionState,
  DownloadProgressExtensionState,
} from './ExtensionTypes';

/**
 * Create a permission request extension
 * Used when a task needs user authorization before proceeding
 */
export function createPermissionExtension(options: {
  id?: string;
  title: string;
  description?: string;
  requiredScopes?: string[];
  allowedActions?: ('allow-once' | 'allow-always' | 'deny')[];
  actionId?: string;
  taskId?: string;
  approvalId?: string;
  state?: PermissionExtensionState;
}): PermissionExtension {
  return {
    type: 'permission',
    id: options.id || `perm-${Date.now()}`,
    state: options.state || 'pending',
    title: options.title,
    description: options.description,
    requiredScopes: options.requiredScopes,
    allowedActions: options.allowedActions || ['allow-once', 'allow-always', 'deny'],
    actionId: options.actionId,
    taskId: options.taskId,
    approvalId: options.approvalId,
    timestamp: Date.now(),
  };
}

/**
 * Create a task progress extension
 * Shows real-time progress of a running task
 */
export function createTaskProgressExtension(options: {
  id?: string;
  taskId: string;
  goal: string;
  state?: TaskProgressExtensionState;
  status?: string;
  progress?: number; // 0-100
  currentAction?: string;
  actions?: TaskProgressExtension['actions'];
  expandTarget?: 'browser' | 'terminal' | 'worktree';
}): TaskProgressExtension {
  return {
    type: 'task-progress',
    id: options.id || `task-${options.taskId}`,
    taskId: options.taskId,
    state: options.state || 'running',
    goal: options.goal,
    status: options.status,
    progress: options.progress,
    currentAction: options.currentAction,
    actions: options.actions,
    expandTarget: options.expandTarget,
    timestamp: Date.now(),
  };
}

/**
 * Create a file change extension
 * Shows edited files with color coding
 */
export function createFileChangeExtension(options: {
  id?: string;
  files: FileChangeExtension['files'];
  state?: FileChangeExtensionState;
  summary?: string;
}): FileChangeExtension {
  return {
    type: 'file-change',
    id: options.id || `files-${Date.now()}`,
    state: options.state || 'detected',
    files: options.files,
    summary: options.summary,
    timestamp: Date.now(),
  };
}

/**
 * Create a markdown preview extension
 * Shows structured content inline
 */
export function createMarkdownPreviewExtension(options: {
  id?: string;
  content: string;
  title?: string;
  maxHeight?: number;
  truncated?: boolean;
}): MarkdownPreviewExtension {
  return {
    type: 'markdown-preview',
    id: options.id || `md-${Date.now()}`,
    content: options.content,
    title: options.title,
    maxHeight: options.maxHeight,
    truncated: options.truncated,
    timestamp: Date.now(),
  };
}

/**
 * Create a browser preview extension
 * Shows live downloads, page previews, etc.
 */
export function createBrowserPreviewExtension(options: {
  id?: string;
  url?: string;
  title?: string;
  state?: 'loading' | 'loaded' | 'error' | 'downloading';
  preview?: string;
  downloadProgress?: {
    current: number;
    total: number;
    speed?: string;
    eta?: number;
  };
}): BrowserPreviewExtension {
  return {
    type: 'browser-preview',
    id: options.id || `browser-${Date.now()}`,
    state: options.state || 'loading',
    url: options.url,
    title: options.title,
    preview: options.preview,
    downloadProgress: options.downloadProgress,
    expandTarget: 'browser',
    timestamp: Date.now(),
  };
}

/**
 * Create a download progress extension
 * Shows file transfers, builds, deployments, etc.
 */
export function createDownloadProgressExtension(options: {
  id?: string;
  name: string;
  state?: DownloadProgressExtensionState;
  progress?: number; // 0-100
  speed?: string;
  eta?: number;
  totalSize?: string;
  downloaded?: string;
  status?: string;
  errors?: string[];
}): DownloadProgressExtension {
  return {
    type: 'download-progress',
    id: options.id || `dl-${Date.now()}`,
    name: options.name,
    state: options.state || 'queued',
    progress: options.progress ?? 0,
    speed: options.speed,
    eta: options.eta,
    totalSize: options.totalSize,
    downloaded: options.downloaded,
    status: options.status,
    errors: options.errors,
    timestamp: Date.now(),
  };
}

/**
 * Create an agent status extension
 * Shows agent running state with progress
 */
export function createAgentStatusExtension(options: {
  id?: string;
  agentId: string;
  agentName: string;
  state?: AgentStatusExtensionState;
  steps?: AgentStatusExtension['steps'];
  currentStep?: string;
  totalSteps?: number;
  error?: string;
}): AgentStatusExtension {
  return {
    type: 'agent-status',
    id: options.id || `agent-${options.agentId}`,
    agentId: options.agentId,
    agentName: options.agentName,
    state: options.state || 'idle',
    steps: options.steps,
    currentStep: options.currentStep,
    totalSteps: options.totalSteps,
    error: options.error,
    timestamp: Date.now(),
  };
}

/**
 * Create a result review extension
 * Shows Accept / Needs Changes buttons after successful execution
 */
export function createResultReviewExtension(options: {
  id?: string;
  resultSummary: string;
  state?: 'pending-review' | 'accepted' | 'needs-changes';
}): import('./ExtensionTypes').ResultReviewExtension {
  return {
    type: 'result-review',
    id: options.id || `review-${Date.now()}`,
    state: options.state || 'pending-review',
    resultSummary: options.resultSummary,
    timestamp: Date.now(),
  };
}

/**
 * Create a finalization extension
 * Shows Save, Commit, Push, Deploy, Comment, Done buttons
 */
export function createFinalizationExtension(options: {
  id?: string;
  availableActions?: Array<'save' | 'commit' | 'push' | 'deploy' | 'comment' | 'done'>;
  state?: 'waiting-action' | 'executing' | 'completed' | 'failed';
}): import('./ExtensionTypes').FinalizationExtension {
  return {
    type: 'finalization',
    id: options.id || `final-${Date.now()}`,
    state: options.state || 'waiting-action',
    availableActions: options.availableActions || ['done'],
    timestamp: Date.now(),
  };
}

/**
 * Update an extension's state and properties
 * Used to reflect real-time changes as tasks progress
 */
export function updateExtension<T extends MessageExtension>(
  extension: T,
  updates: Partial<Omit<T, 'type' | 'id' | 'timestamp'>>
): T {
  return {
    ...extension,
    ...updates,
    timestamp: Date.now(),
  } as T;
}

/**
 * Create a new version of an extension with a specific state
 */
export function transitionExtensionState<T extends MessageExtension>(
  extension: T,
  newState: string,
  updates?: Partial<Omit<T, 'type' | 'id' | 'state' | 'timestamp'>>
): T {
  return {
    ...extension,
    ...updates,
    state: newState as any,
    timestamp: Date.now(),
  } as T;
}
