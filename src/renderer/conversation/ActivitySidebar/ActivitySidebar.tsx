import React, { useMemo } from 'react';
import styles from './activitySidebar.module.css';
import { ActivityDetailView } from './ActivityDetailView';
import { ActivityListView } from './ActivityListView';
import type { ActivityItem } from './useActivityStream';

export function ActivitySidebar({
  activities,
  selectedActivityId,
  onSelectActivity,
  onCloseDetail,
}: {
  activities: ActivityItem[];
  selectedActivityId: string | null;
  onSelectActivity: (id: string) => void;
  onCloseDetail: () => void;
}) {
  const selectedActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId),
    [activities, selectedActivityId]
  );

  if (activities.length === 0) {
    return null; // Don't render if no activities
  }

  return (
    <div className={styles.sidebar}>
      {selectedActivity ? (
        <ActivityDetailView activity={selectedActivity} onClose={onCloseDetail} />
      ) : (
        <ActivityListView activities={activities} onSelectActivity={onSelectActivity} />
      )}
    </div>
  );
}
