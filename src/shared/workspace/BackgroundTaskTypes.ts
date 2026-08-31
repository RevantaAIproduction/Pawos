/**
 * Shared types for background task tracking.
 * Tracks running and completed tasks with logs and status.
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskType =
  | 'meeting_recording'
  | 'meeting_summarization'
  | 'meeting_distribution'
  | 'integration_sync'
  | 'data_export'
  | 'other';

export interface BackgroundTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  description?: string;
  command: string;
  progress: number; // 0-100
  output: string; // accumulated log output
  error?: string;
  startedAt: number;
  finishedAt?: number;
  duration?: number; // in milliseconds
  metadata?: Record<string, unknown>; // task-specific data
  /** When a destructive action requires approval and execution pauses, this tracks the approval ID for resume flow. */
  waitingForApprovalId?: string;
}

export interface TaskLogEntry {
  id: string;
  taskId: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, unknown>;
}

export interface TaskListQuery {
  limit?: number;
  offset?: number;
  status?: TaskStatus;
  type?: TaskType;
  sortBy?: 'startedAt' | 'finishedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TaskListResult {
  ok: boolean;
  tasks: BackgroundTask[];
  total: number;
}

export interface TaskDetailResult {
  ok: boolean;
  task?: BackgroundTask;
  logs?: TaskLogEntry[];
  reason?: string;
}

export interface TaskStartResult {
  ok: boolean;
  taskId?: string;
  reason?: string;
}

export interface TaskCancelResult {
  ok: boolean;
  reason?: string;
}
