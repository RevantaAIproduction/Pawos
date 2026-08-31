import React from 'react';
import styles from './activitySidebar.module.css';
import type { ActivityItem } from './useActivityStream';

export function ActivityListView({
  activities,
  onSelectActivity,
}: {
  activities: ActivityItem[];
  onSelectActivity: (id: string) => void;
}) {
  if (activities.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateText}>No active work</div>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <div className={styles.listHeader}>Activity</div>
      <div className={styles.listItems}>
        {activities.map((activity) => (
          <button
            key={activity.id}
            className={styles.listItem}
            onClick={() => onSelectActivity(activity.id)}
            type="button"
          >
            <div className={styles.activityIcon}>
              {activity.status === 'running' ? '⚙️' : activity.status === 'failed' ? '❌' : '✓'}
            </div>
            <div className={styles.activityContent}>
              <div className={styles.activityTitle}>{activity.title}</div>
              <div className={styles.activityType}>
                {activity.type.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              <div className={styles.activityStatus}>{activity.status}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
