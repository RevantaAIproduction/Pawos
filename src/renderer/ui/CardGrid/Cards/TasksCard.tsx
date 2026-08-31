import React, { useState } from 'react';
import styles from './tasksCard.module.css';
import type { CardConfig } from '../Card';

interface Task {
  id: string;
  title: string;
  status: 'running' | 'completed' | 'failed' | 'queued';
  progress?: number;
  startTime?: string;
  duration?: string;
  message?: string;
}

interface TasksCardProps {
  card: CardConfig;
  onRemoveCard: (cardId: string) => void;
}

export function TasksCard({ card, onRemoveCard }: TasksCardProps) {
  const [tasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Build application',
      status: 'running',
      progress: 45,
      startTime: '10:22 AM',
      message: 'Compiling TypeScript...',
    },
    {
      id: '2',
      title: 'Run unit tests',
      status: 'queued',
      startTime: '10:25 AM (scheduled)',
    },
    {
      id: '3',
      title: 'Deploy to staging',
      status: 'completed',
      duration: '2m 34s',
      startTime: '10:10 AM',
    },
    {
      id: '4',
      title: 'Security scan',
      status: 'failed',
      startTime: '10:05 AM',
      message: 'Found 3 vulnerabilities',
    },
  ]);

  const [filter, setFilter] = useState<'all' | 'running' | 'completed'>('all');

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'running') return task.status === 'running' || task.status === 'queued';
    if (filter === 'completed') return task.status === 'completed' || task.status === 'failed';
    return true;
  });

  return (
    <div className={styles.tasksCard}>
      <div className={styles.filterBar}>
        {(['all', 'running', 'completed'] as const).map((f) => (
          <button
            key={f}
            className={`${styles.filterButton} ${filter === f ? styles.active : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.tasksList}>
        {filteredTasks.length === 0 ? (
          <div className={styles.empty}>No tasks</div>
        ) : (
          filteredTasks.map((task) => (
            <div key={task.id} className={`${styles.taskItem} ${styles[task.status]}`}>
              <div className={styles.taskHeader}>
                <div className={`${styles.statusIcon} ${styles[task.status]}`}>
                  {task.status === 'running' && '⟳'}
                  {task.status === 'completed' && '✓'}
                  {task.status === 'failed' && '✕'}
                  {task.status === 'queued' && '⋯'}
                </div>
                <div className={styles.taskTitle}>{task.title}</div>
                <span className={styles.statusLabel}>{task.status}</span>
              </div>

              {task.progress !== undefined && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className={styles.progressText}>{task.progress}%</span>
                </div>
              )}

              {task.message && <div className={styles.taskMessage}>{task.message}</div>}

              <div className={styles.taskMetadata}>
                {task.startTime && <span>{task.startTime}</span>}
                {task.duration && <span className={styles.duration}>{task.duration}</span>}
              </div>

              <div className={styles.taskActions}>
                {task.status === 'running' && (
                  <button className={styles.actionButton}>Stop</button>
                )}
                {task.status === 'failed' && (
                  <button className={styles.actionButton}>Retry</button>
                )}
                <button className={styles.actionButton}>Details</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
