/**
 * Service layer for background task logging and tracking.
 * Provides a clean interface for task management.
 */

import type { BackgroundTask, TaskListQuery, TaskLogEntry, TaskType } from '../../../shared/workspace/BackgroundTaskTypes';
import {
  cancelTask,
  clearOldTasks,
  completeTask,
  getTaskDetail,
  getTaskLogs,
  listTasks,
  logTaskEvent,
  startTask,
  updateTaskProgress,
} from '../../ipc/handlers/backgroundTasksHandler';

export class TaskLogService {
  /**
   * Start a new background task
   */
  static startTask(type: TaskType, title: string, command: string, metadata?: Record<string, unknown>): string | null {
    const result = startTask(type, title, command, metadata);
    return result.ok ? result.taskId || null : null;
  }

  /**
   * Update task progress
   */
  static updateProgress(taskId: string, progress: number, output?: string): boolean {
    const result = updateTaskProgress(taskId, progress, output);
    return result.ok;
  }

  /**
   * Complete a task
   */
  static completeTask(taskId: string, error?: string): boolean {
    const result = completeTask(taskId, error);
    return result.ok;
  }

  /**
   * Cancel a running task
   */
  static cancelTask(taskId: string): boolean {
    const result = cancelTask(taskId);
    return result.ok;
  }

  /**
   * Get a task with its logs
   */
  static getTask(taskId: string): { task: BackgroundTask | null; logs: TaskLogEntry[] } {
    const result = getTaskDetail(taskId);
    return {
      task: result.task || null,
      logs: result.logs || [],
    };
  }

  /**
   * List all tasks with optional filtering
   */
  static listTasks(query?: TaskListQuery): BackgroundTask[] {
    const result = listTasks(query);
    return result.ok ? result.tasks : [];
  }

  /**
   * Get logs for a task
   */
  static getTaskLogs(taskId: string, limit?: number): TaskLogEntry[] {
    const result = getTaskLogs(taskId, limit);
    return result.ok ? result.logs || [] : [];
  }

  /**
   * Add a log entry to a task
   */
  static log(
    taskId: string,
    message: string,
    level: 'info' | 'warn' | 'error' | 'debug' = 'info',
    context?: Record<string, unknown>
  ): void {
    logTaskEvent(taskId, level, message, context);
  }

  /**
   * Get running tasks
   */
  static getRunningTasks(): BackgroundTask[] {
    return this.listTasks({ status: 'running' });
  }

  /**
   * Get completed tasks
   */
  static getCompletedTasks(limit?: number): BackgroundTask[] {
    const query: TaskListQuery = {
      status: 'completed',
      limit: limit || 50,
      sortBy: 'finishedAt',
      sortOrder: 'desc',
    };
    return this.listTasks(query);
  }

  /**
   * Get failed tasks
   */
  static getFailedTasks(limit?: number): BackgroundTask[] {
    const query: TaskListQuery = {
      status: 'failed',
      limit: limit || 50,
      sortBy: 'finishedAt',
      sortOrder: 'desc',
    };
    return this.listTasks(query);
  }

  /**
   * Clear old tasks
   */
  static clearOld(olderThanDays?: number): number {
    return clearOldTasks(olderThanDays);
  }

  /**
   * Get summary statistics
   */
  static getStats(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const tasks = this.listTasks({ limit: 9999 });
    return {
      total: tasks.length,
      running: tasks.filter((t) => t.status === 'running').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      cancelled: tasks.filter((t) => t.status === 'cancelled').length,
    };
  }
}
