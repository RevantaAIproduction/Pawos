import React from 'react';
import styles from './activityDisplay.module.css';

interface Activity {
  id: string;
  type: 'file' | 'agent' | 'task' | 'thinking' | 'running' | 'editing';
  label: string;
  status: 'active' | 'completed' | 'error';
  timestamp?: Date;
  details?: string;
}

interface ActivityDisplayProps {
  activities: Activity[];
  onActivityClick?: (activity: Activity) => void;
}

export function ActivityDisplay({ activities, onActivityClick }: ActivityDisplayProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'file':
        return '📄';
      case 'agent':
        return '🤖';
      case 'task':
        return '✓';
      case 'thinking':
        return '💭';
      case 'running':
        return '▶️';
      case 'editing':
        return '✏️';
      default:
        return '•';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return styles.statusActive;
      case 'completed':
        return styles.statusCompleted;
      case 'error':
        return styles.statusError;
      default:
        return '';
    }
  };

  const formatTime = (date?: Date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  if (activities.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>No active tasks</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>Activity</div>
      <div className={styles.list}>
        {activities.map((activity) => (
          <div
            key={activity.id}
            className={`${styles.item} ${getStatusColor(activity.status)}`}
            onClick={() => onActivityClick?.(activity)}
          >
            <div className={styles.icon}>{getIcon(activity.type)}</div>
            <div className={styles.content}>
              <div className={styles.label}>{activity.label}</div>
              {activity.details && (
                <div className={styles.details}>{activity.details}</div>
              )}
            </div>
            <div className={styles.status}>
              {activity.status === 'active' && (
                <div className={styles.spinner} />
              )}
              <div className={styles.time}>{formatTime(activity.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
