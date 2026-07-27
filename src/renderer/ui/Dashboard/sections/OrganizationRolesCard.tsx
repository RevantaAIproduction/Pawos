import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { Toggle } from '../Toggle';
import { permissionService } from '../../../organization/PermissionService';
import { organizationService } from '../../../organization/OrganizationService';
import {
  BUILT_IN_ORG_JOB_ROLES,
  ORG_JOB_ROLE_DEPARTMENTS,
  ORG_JOB_ROLE_DEPARTMENT_LABELS,
  builtInOrgJobRolesByDepartment,
  builtinJobRoleRef,
  customJobRoleRef,
  type OrgJobRole,
  type OrgJobRoleDepartment,
} from '../../../../shared/organization/OrgJobRoles';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';

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

const departmentBadgeStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  color: '#96969e',
  whiteSpace: 'nowrap',
};

export function OrganizationRolesCard({ organizationId, orgMembers }: { organizationId: string; orgMembers: OrganizationMember[] }) {
  const [canManage, setCanManage] = useState(false);
  const [customRoles, setCustomRoles] = useState<OrgJobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDepartment, setNewRoleDepartment] = useState<OrgJobRoleDepartment>('engineering');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  function reload() {
    setLoading(true);
    setError(null);
    Promise.all([
      permissionService.hasCapability(organizationId, 'org_roles.manage'),
      organizationService.listCustomJobRoles(organizationId),
    ])
      .then(([manage, roles]) => {
        setCanManage(manage);
        setCustomRoles(roles);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [organizationId]);

  function memberCountFor(ref: string): number {
    return orgMembers.filter((m) => m.status !== 'removed' && m.jobRoleRef === ref).length;
  }

  async function createRole() {
    if (!newRoleName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await organizationService.createCustomJobRole(organizationId, newRoleName.trim(), newRoleDepartment);
      setCustomRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRoleName('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(id: string) {
    if (!renameInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await organizationService.renameCustomJobRole(id, renameInput.trim());
      setCustomRoles((prev) => prev.map((r) => (r.id === id ? { ...r, name: renameInput.trim() } : r)));
      setRenamingId(null);
      setRenameInput('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchived(role: OrgJobRole) {
    setBusy(true);
    setError(null);
    try {
      await organizationService.setCustomJobRoleArchived(role.id, !role.archived);
      setCustomRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, archived: !r.archived } : r)));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Organization Roles</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          A teammate's job title (e.g. "Frontend Engineer") — completely independent of their seat type and
          permission role. Assign a role to each member from the Members list above.
          {!canManage && ' Only the owner or an org-roles manager can create or edit custom roles.'}
        </p>
        {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Built-in roles</h3>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 10 }}>
          Always available to every organization — {BUILT_IN_ORG_JOB_ROLES.length} roles across{' '}
          {ORG_JOB_ROLE_DEPARTMENTS.length} departments.
        </p>
        {ORG_JOB_ROLE_DEPARTMENTS.map((dept) => (
          <div key={dept} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#c8c8d2', marginBottom: 6 }}>
              {ORG_JOB_ROLE_DEPARTMENT_LABELS[dept]}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {builtInOrgJobRolesByDepartment(dept).map((role) => {
                const count = memberCountFor(builtinJobRoleRef(role.key));
                return (
                  <span
                    key={role.key}
                    style={{
                      fontSize: 12,
                      padding: '5px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#c8c8d2',
                    }}
                  >
                    {role.label}
                    {count > 0 && <span style={{ color: '#7c9cff', marginLeft: 6 }}>{count}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Custom roles</h3>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 10 }}>
          Roles specific to your organization, in addition to the built-in catalog above.
        </p>
        {loading ? (
          <p className={styles.cardBody}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customRoles.map((role) => {
              const count = memberCountFor(customJobRoleRef(role.id));
              return (
                <div
                  key={role.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {renamingId === role.id ? (
                    <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        autoFocus
                      />
                      <button type="button" className={styles.primaryButton} disabled={busy || !renameInput.trim()} onClick={() => saveRename(role.id)}>
                        Save
                      </button>
                      <button type="button" onClick={() => { setRenamingId(null); setRenameInput(''); }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, opacity: role.archived ? 0.5 : 1 }}>{role.name}</span>
                        {role.department && (
                          <span style={departmentBadgeStyle}>{ORG_JOB_ROLE_DEPARTMENT_LABELS[role.department]}</span>
                        )}
                        {role.archived && <span style={departmentBadgeStyle}>Archived</span>}
                        {count > 0 && <span style={{ fontSize: 11.5, color: '#7c9cff' }}>{count} member{count === 1 ? '' : 's'}</span>}
                      </div>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(role.id); setRenameInput(role.name); }}
                            style={{ fontSize: 11.5, background: 'none', border: 'none', color: 'var(--pawos-accent, #7c9cff)', cursor: 'pointer' }}
                          >
                            Rename
                          </button>
                          <Toggle
                            size="sm"
                            checked={!role.archived}
                            onChange={() => toggleArchived(role)}
                            label={role.archived ? `Restore ${role.name}` : `Archive ${role.name}`}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {customRoles.length === 0 && <p className={styles.cardBody}>No custom roles yet.</p>}
          </div>
        )}

        {canManage && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="e.g. Growth Marketer"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
            />
            <select style={inputStyle} value={newRoleDepartment} onChange={(e) => setNewRoleDepartment(e.target.value as OrgJobRoleDepartment)}>
              {ORG_JOB_ROLE_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{ORG_JOB_ROLE_DEPARTMENT_LABELS[d]}</option>
              ))}
            </select>
            <button type="button" className={styles.primaryButton} disabled={busy || !newRoleName.trim()} onClick={createRole}>
              Create role
            </button>
          </div>
        )}
      </div>
    </>
  );
}
