/**
 * IPC handler for background task tracking.
 * Tracks running and finished tasks with their logs and status.
 */

import type {
  BackgroundTask,
  TaskCancelResult,
  TaskDetailResult,
  TaskListQuery,
  TaskListResult,
  TaskLogEntry,
  TaskStartResult,
  TaskStatus,
  TaskType,
} from '../../../shared/workspace/BackgroundTaskTypes';

// In-memory store for tasks
const taskStore = new Map<string, BackgroundTask>();
const taskLogStore = new Map<string, TaskLogEntry[]>();
let taskIdCounter = 0;

/**
 * Start a new background task
 */
export function startTask(
  type: TaskType,
  title: string,
  command: string,
  metadata?: Record<string, unknown>
): TaskStartResult {
  try {
    const taskId = `task-${Date.now()}-${++taskIdCounter}`;
    const task: BackgroundTask = {
      id: taskId,
      type,
      status: 'pending',
      title,
      command,
      progress: 0,
      output: '',
      startedAt: Date.now(),
      metadata,
    };

    taskStore.set(taskId, task);
    taskLogStore.set(taskId, []);

    logTaskEvent(taskId, 'info', `Task started: ${command}`);

    return { ok: true, taskId };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to start task',
    };
  }
}

/**
 * Update task progress
 */
export function updateTaskProgress(
  taskId: string,
  progress: number,
  output?: string
): { ok: boolean; reason?: string } {
  try {
    const task = taskStore.get(taskId);
    if (!task) {
      return { ok: false, reason: 'Task not found' };
    }

    task.progress = Math.min(100, Math.max(0, progress));
    if (output) {
      task.output += output + '\n';
    }

    if (task.status === 'pending' && progress > 0) {
      task.status = 'running';
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to update progress',
    };
  }
}

/**
 * Complete a task
 */
export function completeTask(
  taskId: string,
  error?: string
): { ok: boolean; task?: BackgroundTask; reason?: string } {
  try {
    const task = taskStore.get(taskId);
    if (!task) {
      return { ok: false, reason: 'Task not found' };
    }

    task.finishedAt = Date.now();
    task.duration = task.finishedAt - task.startedAt;
    task.progress = error ? task.progress : 100;
    task.status = error ? 'failed' : 'completed';

    if (error) {
      task.error = error;
      logTaskEvent(taskId, 'error', error);
    } else {
      logTaskEvent(taskId, 'info', 'Task completed successfully');
    }

    return { ok: true, task };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to complete task',
    };
  }
}

/**
 * Cancel a running task
 */
export function cancelTask(taskId: string): TaskCancelResult {
  try {
    const task = taskStore.get(taskId);
    if (!task) {
      return { ok: false, reason: 'Task not found' };
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return { ok: false, reason: `Cannot cancel a ${task.status} task` };
    }

    task.status = 'cancelled';
    task.finishedAt = Date.now();
    task.duration = task.finishedAt - task.startedAt;
    logTaskEvent(taskId, 'info', 'Task cancelled by user');

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to cancel task',
    };
  }
}

/**
 * Get a single task with its logs
 */
export function getTaskDetail(taskId: string): TaskDetailResult {
  try {
    const task = taskStore.get(taskId);
    if (!task) {
      return { ok: false, reason: 'Task not found' };
    }

    const logs = taskLogStore.get(taskId) || [];

    return { ok: true, task, logs };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to get task detail',
    };
  }
}

/**
 * List tasks with optional filtering and sorting
 */
export function listTasks(query?: TaskListQuery): TaskListResult {
  try {
    let tasks = Array.from(taskStore.values());

    // Apply filters
    if (query?.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }
    if (query?.type) {
      tasks = tasks.filter((t) => t.type === query.type);
    }

    // Sort
    const sortBy = query?.sortBy || 'startedAt';
    const sortOrder = query?.sortOrder || 'desc';
    tasks.sort((a, b) => {
      const aVal = a[sortBy as keyof BackgroundTask] || 0;
      const bVal = b[sortBy as keyof BackgroundTask] || 0;
      const diff = (aVal as number) - (bVal as number);
      return sortOrder === 'asc' ? diff : -diff;
    });

    // Paginate
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    const paginated = tasks.slice(offset, offset + limit);

    return {
      ok: true,
      tasks: paginated,
      total: tasks.length,
    };
  } catch (error) {
    return {
      ok: false,
      tasks: [],
      total: 0,
    };
  }
}

/**
 * Get logs for a specific task
 */
export function getTaskLogs(
  taskId: string,
  limit?: number
): { ok: boolean; logs?: TaskLogEntry[]; reason?: string } {
  try {
    const task = taskStore.get(taskId);
    if (!task) {
      return { ok: false, reason: 'Task not found' };
    }

    let logs = taskLogStore.get(taskId) || [];
    if (limit) {
      logs = logs.slice(-limit);
    }

    return { ok: true, logs };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to get logs',
    };
  }
}

/**
 * Add a log entry for a task
 */
export function logTaskEvent(
  taskId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context?: Record<string, unknown>
): void {
  try {
    let logs = taskLogStore.get(taskId);
    if (!logs) {
      logs = [];
      taskLogStore.set(taskId, logs);
    }

    const entry: TaskLogEntry = {
      id: `log-${Date.now()}`,
      taskId,
      timestamp: Date.now(),
      level,
      message,
      context,
    };

    logs.push(entry);

    // Keep only last 1000 logs per task to avoid memory issues
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
  } catch {
    // Silently fail log entries
  }
}

/**
 * Clear old tasks (older than specified days)
 */
export function clearOldTasks(olderThanDays: number = 30): number {
  try {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let cleared = 0;

    for (const [taskId, task] of taskStore.entries()) {
      if (
        (task.finishedAt || task.startedAt) < cutoffTime &&
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
      ) {
        taskStore.delete(taskId);
        taskLogStore.delete(taskId);
        cleared++;
      }
    }

    return cleared;
  } catch {
    return 0;
  }
}
