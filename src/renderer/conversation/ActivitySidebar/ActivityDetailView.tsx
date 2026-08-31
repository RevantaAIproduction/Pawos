import React from 'react';
import styles from './activitySidebar.module.css';
import { TaskDetailView } from './details/TaskDetailView';
import type { ActivityItem } from './useActivityStream';

export function ActivityDetailView({
  activity,
  onClose,
}: {
  activity: ActivityItem;
  onClose: () => void;
}) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>{activity.title}</div>
        <button className={styles.closeBtn} onClick={onClose} type="button" title="Close">
          ✕
        </button>
      </div>

      <div className={styles.detailContent}>
        {(activity.type === 'running-task' || activity.type === 'finished-task') && (
          <TaskDetailView task={activity.data as any} />
        )}

        {activity.type === 'file-change' && (
          <div className={styles.placeholder}>File change details coming soon</div>
        )}

        {activity.type === 'running-command' && (
          <div className={styles.placeholder}>Command details coming soon</div>
        )}

        {activity.type === 'running-agent' && (
          <div className={styles.placeholder}>Agent details coming soon</div>
        )}

        {activity.type === 'proposed-plan' && (
          <div className={styles.placeholder}>Plan details coming soon</div>
        )}

        {activity.type === 'proposed-migration' && (
          <div className={styles.placeholder}>Migration details coming soon</div>
        )}

        {activity.type === 'pr-activity' && (
          <div className={styles.placeholder}>PR details coming soon</div>
        )}

        {activity.type === 'git-operation' && (
          <div className={styles.placeholder}>Git details coming soon</div>
        )}

        {activity.type === 'extension' && (
          <div className={styles.placeholder}>Extension details coming soon</div>
        )}
      </div>
    </div>
  );
}
