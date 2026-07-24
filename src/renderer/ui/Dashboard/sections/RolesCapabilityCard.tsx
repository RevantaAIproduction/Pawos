import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { permissionService } from '../../../organization/PermissionService';
import { KNOWN_CAPABILITIES } from '../../../../shared/organization/PermissionTypes';
import type { RoleCapability } from '../../../../shared/organization/PermissionTypes';
import type { OrgRole } from '../../../../shared/organization/OrganizationTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Phase 0's capability engine, made visible: a role × capability grid an
 * org owner/roles-manager can edit directly. Real RLS enforcement (via
 * has_capability('roles.manage')) is what actually gates the writes —
 * this component just reflects that back honestly (toggles revert if the
 * server rejects them).
 */
export function RolesCapabilityCard({ organizationId, roleOptions }: { organizationId: string; roleOptions: OrgRole[] }) {
  const [grants, setGrants] = useState<RoleCapability[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      permissionService.listRoleCapabilities(organizationId),
      permissionService.hasCapability(organizationId, 'roles.manage'),
    ])
      .then(([roleGrants, manage]) => {
        setGrants(roleGrants);
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [organizationId]);

  function isAllowed(role: string, capability: string): boolean {
    return grants.some((g) => g.role === role && g.capability === capability && g.allowed);
  }

  async function toggle(role: string, capability: string) {
    if (!canManage) return;
    const next = !isAllowed(role, capability);
    setGrants((prev) => {
      const existing = prev.find((g) => g.role === role && g.capability === capability);
      if (existing) return prev.map((g) => (g === existing ? { ...g, allowed: next } : g));
      return [...prev, { id: `${role}:${capability}`, organizationId, role, capability, allowed: next }];
    });
    try {
      await permissionService.setRoleCapability(organizationId, role, capability, next);
    } catch (e) {
      setError(getErrorMessage(e));
      // revert on rejection (e.g. RLS denied it)
      setGrants((prev) => prev.map((g) => (g.role === role && g.capability === capability ? { ...g, allowed: !next } : g)));
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Roles</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        What each role can do in this organization. {!canManage && 'Only the owner or a roles manager can change this.'}
      </p>
      {loading ? (
        <p className={styles.cardBody}>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#96969e', fontWeight: 500 }}>Capability</th>
                {roleOptions.map((role) => (
                  <th key={role} style={{ textAlign: 'center', padding: '6px 10px', color: '#96969e', fontWeight: 500 }}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KNOWN_CAPABILITIES.map((capability) => (
                <tr key={capability} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '6px 10px' }}>{capability}</td>
                  {roleOptions.map((role) => (
                    <td key={role} style={{ textAlign: 'center', padding: '6px 10px' }}>
                      <input
                        type="checkbox"
                        checked={isAllowed(role, capability)}
                        disabled={!canManage}
                        onChange={() => toggle(role, capability)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
