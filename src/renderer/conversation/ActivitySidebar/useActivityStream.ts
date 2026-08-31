import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import type { ConversationSnapshot } from '../ConversationTypes';
import type { ExecutionRecord } from '../../../shared/actions/ExecutionRecordTypes';

export type ActivityType =
  | 'running-task'
  | 'finished-task'
  | 'file-change'
  | 'running-command'
  | 'running-agent'
  | 'proposed-plan'
  | 'proposed-migration'
  | 'pr-activity'
  | 'git-operation'
  | 'extension';

export type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  status: 'running' | 'proposed' | 'finished' | 'failed' | 'cancelled';
  timestamp: number;
  data: unknown;
};

/**
 * Unified activity stream combining:
 * - Current conversation running task
 * - Execution history (finished tasks)
 * - File changes
 * - Running agents/commands
 * - Plans/migrations (from conversation messages)
 */
export function useActivityStream(snapshot: ConversationSnapshot) {
  const ipc = useIpcBridge();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  // Track current running task from conversation
  const runningTask = useMemo(() => {
    for (let i = snapshot.messages.length - 1; i >= 0; i--) {
      const msg = snapshot.messages[i];
      if (msg && msg.role === 'system' && msg.task) {
        if (msg.task.status === 'running') {
          return msg.task;
        }
      }
    }
    return null;
  }, [snapshot.messages]);

  // Track finished tasks from conversation history
  const finishedTasks = useMemo(() => {
    const finished: typeof snapshot.messages[0]['task'][] = [];
    for (const msg of snapshot.messages) {
      if (msg && msg.role === 'system' && msg.task && msg.task.status === 'completed') {
        finished.push(msg.task);
      }
    }
    return finished;
  }, [snapshot.messages]);

  // Refresh activity stream whenever running task or conversation changes
  const refresh = useCallback(() => {
    const newActivities: ActivityItem[] = [];

    // Add running task from current conversation
    if (runningTask) {
      newActivities.push({
        id: `task-running-${runningTask.id}`,
        type: 'running-task',
        title: runningTask.goal,
        status: 'running',
        timestamp: runningTask.startedAt,
        data: runningTask,
      });
    }

    // Add recent finished tasks (last 3)
    for (let i = 0; i < Math.min(3, finishedTasks.length); i++) {
      const task = finishedTasks[i];
      if (task) {
        newActivities.push({
          id: `task-finished-${task.id}`,
          type: 'finished-task',
          title: task.goal,
          status: task.status === 'failed' ? 'failed' : 'finished',
          timestamp: task.endedAt || task.startedAt,
          data: task,
        });
      }
    }

    setActivities(newActivities);

    // If current selection no longer exists, clear it
    if (selectedActivityId && !newActivities.find((a) => a.id === selectedActivityId)) {
      setSelectedActivityId(null);
    }
  }, [runningTask, finishedTasks, selectedActivityId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    activities,
    selectedActivityId,
    setSelectedActivityId,
    hasActivity: activities.length > 0,
  };
}
