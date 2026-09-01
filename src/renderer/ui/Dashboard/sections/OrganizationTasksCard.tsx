import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { workspaceTaskService, type WorkspaceTask } from '../../../organization/WorkspaceTaskService';
import { permissionService } from '../../../organization/PermissionService';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const statusColors: Record<string, string> = {
  todo: '#96969e',
  in_progress: '#3b82f6',
  blocked: '#f59e0b',
  done: '#8ce0a8',
  cancelled: '#ef4444',
};

const statusLabels: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export function OrganizationTasksCard({ organizationId, members }: { organizationId: string; members: OrganizationMember[] }) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  function reload() {
    Promise.all([
      workspaceTaskService.listByOrganization(organizationId),
      permissionService.hasCapability(organizationId, 'workspaces.manage'),
    ])
      .then(([loadedTasks, manage]) => {
        setTasks(loadedTasks);
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    return workspaceTaskService.subscribeToTasks(organizationId, reload);
  }, [organizationId]);

  async function assignTask(taskId: string, userId: string | null) {
    try {
      await workspaceTaskService.assign(taskId, userId);
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: WorkspaceTask['status']) {
    try {
      await workspaceTaskService.updateStatus(taskId, newStatus);
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  if (loading) return <div className={styles.card}><h3 className={styles.cardTitle}>Tasks</h3><p className={styles.cardBody}>Loading…</p></div>;

  const tasksByStatus = {
    todo: tasks.filter((t) => t.status === 'todo'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    blocked: tasks.filter((t) => t.status === 'blocked'),
    done: tasks.filter((t) => t.status === 'done'),
  };

  const memberMap = new Map(members.map((m) => [m.userId, m.displayName || m.email]));

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Tasks</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>Organization tasks — track work, assign to members, monitor progress.</p>
      {['todo', 'in_progress', 'blocked', 'done'].map((status) => {
        const statusTasks = tasksByStatus[status as keyof typeof tasksByStatus];
        return (
          <div key={status} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: statusColors[status], marginBottom: 8 }}>{statusLabels[status]} ({statusTasks.length})</div>
            {statusTasks.length === 0 ? (
              <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>None</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {statusTasks.map((task) => (
                  <div key={task.id} style={{ padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer' }} onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</span>
                      <span style={{ fontSize: 11, color: '#96969e' }}>{task.progressPercent}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#96969e' }}>{memberMap.get(task.assignedTo) ? Assigned to  : 'Unassigned'}</div>
                    {expandedTaskId === task.id && canManage && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <label style={{ fontSize: 11, color: '#96969e', display: 'block', marginBottom: 4 }}>Assign to:</label>
                        <select value={task.assignedTo || ''} onChange={(e) => assignTask(task.id, e.target.value || null)} style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)', color: 'inherit' }}>
                          <option value="">Unassigned</option>
                          {members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
