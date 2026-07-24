import { getSupabaseClient } from '../auth/supabaseClient';
import type { OrganizationTemporaryPermission } from '../../shared/organization/TemporaryPermissionTypes';

type TempPermissionRow = {
  id: string;
  organization_id: string;
  user_id: string;
  capability: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  reason: string | null;
};

function toTempPermission(row: TempPermissionRow): OrganizationTemporaryPermission {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    capability: row.capability,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    reason: row.reason,
  };
}

/**
 * Phase 2 — time-bound capability grants. Direct-Supabase pattern.
 * RLS lets a user see their own grants; only a permissions.grant holder
 * sees every grant in the org and can create/revoke. Expiration is
 * enforced live by has_capability() comparing expires_at to now() — this
 * service never needs to "clean up" expired rows for correctness, only
 * for readability (isActive() below is a display-only convenience).
 */
export const temporaryPermissionService = {
  async listForOrganization(organizationId: string): Promise<OrganizationTemporaryPermission[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_temporary_permissions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('granted_at', { ascending: false })
      .returns<TempPermissionRow[]>();
    if (error) throw error;
    return (data ?? []).map(toTempPermission);
  },

  async grant(organizationId: string, userId: string, capability: string, expiresAt: string, reason?: string): Promise<OrganizationTemporaryPermission> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_temporary_permissions')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        capability,
        expires_at: expiresAt,
        reason: reason ?? null,
        granted_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<TempPermissionRow>();
    if (error) throw error;
    return toTempPermission(data);
  },

  async revoke(grantId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_temporary_permissions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', grantId);
    if (error) throw error;
  },
};

export function isTemporaryPermissionActive(grant: OrganizationTemporaryPermission): boolean {
  if (grant.revokedAt) return false;
  return new Date(grant.expiresAt).getTime() > Date.now();
}
