import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { organizationWorkspaceService } from '../../../organization/OrganizationWorkspaceService';
import { permissionService } from '../../../organization/PermissionService';
import { WorkspaceDetailPanel } from './WorkspaceDetailPanel';
import type { OrganizationWorkspace } from '../../../../shared/organization/PermissionTypes';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';
import type { AuthUser } from '../../../auth/AuthTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
};

/**
 * Phase 0 workspace container — just the container. Projects, shared
 * documents, and sessions attach to a workspace in later phases per the
 * approved roadmap; this ships create/list only.
 */
export function OrganizationWorkspaceCard({
  organizationId,
  orgMembers,
  currentUser,
}: {
  organizationId: string;
  orgMembers: OrganizationMember[];
  currentUser: AuthUser;
}) {
  const [workspaces, setWorkspaces] = useState<OrganizationWorkspace[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      organizationWorkspaceService.listWorkspaces(organizationId),
      permissionService.hasCapability(organizationId, 'workspaces.manage'),
    ])
      .then(([ws, manage]) => {
        setWorkspaces(ws);
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [organizationId]);

  async function createWorkspace() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await organizationWorkspaceService.createWorkspace(organizationId, name.trim());
      setWorkspaces((prev) => [...prev, created]);
      setName('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Workspace</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Organization-wide containers your team's work will attach to as shared projects, documents, and sessions roll out.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
            onClick={() => setSelectedWorkspaceId((prev) => (prev === ws.id ? null : ws.id))}
          >
            <div style={{ fontSize: 13.5 }}>{ws.name}</div>
            {ws.description && <div style={{ fontSize: 12, color: '#96969e' }}>{ws.description}</div>}
          </div>
        ))}
        {workspaces.length === 0 && <p className={styles.cardBody}>No workspaces yet.</p>}
      </div>
      {selectedWorkspaceId &&
        (() => {
          const selected = workspaces.find((ws) => ws.id === selectedWorkspaceId);
          return selected ? <WorkspaceDetailPanel workspace={selected} orgMembers={orgMembers} currentUser={currentUser} /> : null;
        })()}
      {canManage && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="button" className={styles.primaryButton} disabled={busy || !name.trim()} onClick={createWorkspace}>
            Create
          </button>
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
