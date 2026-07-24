import { getSupabaseClient } from '../auth/supabaseClient';
import type { RoleCapability, OrganizationPolicy, AuditLogEntry } from '../../shared/organization/PermissionTypes';
import { REQUIRE_APPROVAL_POLICY_KEY, type RequireApprovalPolicyValue } from '../../shared/organization/GovernanceTypes';

type RoleCapabilityRow = {
  id: string;
  organization_id: string;
  role: string;
  capability: string;
  allowed: boolean;
};

type OrganizationPolicyRow = {
  id: string;
  organization_id: string;
  policy_key: string;
  policy_value: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

type AuditLogRow = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: 'created' | 'updated' | 'deleted';
  entity_type: string;
  entity_id: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  created_at: string;
};

function toRoleCapability(row: RoleCapabilityRow): RoleCapability {
  return { id: row.id, organizationId: row.organization_id, role: row.role, capability: row.capability, allowed: row.allowed };
}

function toPolicy(row: OrganizationPolicyRow): OrganizationPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    policyKey: row.policy_key,
    policyValue: row.policy_value,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function toAuditEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    createdAt: row.created_at,
  };
}

/**
 * Phase 0 capability engine — direct-Supabase pattern matching
 * OrganizationService.ts (inherently cloud-backed, no IPC needed). RLS
 * enforces every write through has_capability(); this service is a thin
 * typed wrapper, not where the actual security lives.
 */
export const permissionService = {
  async listRoleCapabilities(organizationId: string): Promise<RoleCapability[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('role_capabilities')
      .select('*')
      .eq('organization_id', organizationId)
      .returns<RoleCapabilityRow[]>();
    if (error) throw error;
    return (data ?? []).map(toRoleCapability);
  },

  /** Grants or revokes one role's capability. RLS rejects this unless the
   * caller holds `roles.manage` (or is the org owner). */
  async setRoleCapability(organizationId: string, role: string, capability: string, allowed: boolean): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('role_capabilities')
      .upsert({ organization_id: organizationId, role, capability, allowed }, { onConflict: 'organization_id,role,capability' });
    if (error) throw error;
  },

  async hasCapability(organizationId: string, capability: string): Promise<boolean> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('has_capability', { p_organization_id: organizationId, p_capability: capability });
    if (error) throw error;
    return Boolean(data);
  },

  async listPolicies(organizationId: string): Promise<OrganizationPolicy[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_policies')
      .select('*')
      .eq('organization_id', organizationId)
      .returns<OrganizationPolicyRow[]>();
    if (error) throw error;
    return (data ?? []).map(toPolicy);
  },

  async setPolicy(organizationId: string, policyKey: string, policyValue: Record<string, unknown>): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('organization_policies')
      .upsert(
        { organization_id: organizationId, policy_key: policyKey, policy_value: policyValue, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id,policy_key' }
      );
    if (error) throw error;
  },

  async listAuditLog(organizationId: string, limit = 50): Promise<AuditLogEntry[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<AuditLogRow[]>();
    if (error) throw error;
    return (data ?? []).map(toAuditEntry);
  },

  /** Phase 6 governance convenience over the generic policy row Phase 0
   * already built — reads the one 'require_approval' policy_key rather
   * than making callers know its jsonb shape. */
  async getRequireApprovalCapabilities(organizationId: string): Promise<string[]> {
    const policies = await permissionService.listPolicies(organizationId);
    const row = policies.find((p) => p.policyKey === REQUIRE_APPROVAL_POLICY_KEY);
    const value = row?.policyValue as RequireApprovalPolicyValue | undefined;
    return value?.capabilities ?? [];
  },

  async setRequireApprovalCapabilities(organizationId: string, capabilities: string[]): Promise<void> {
    const value: RequireApprovalPolicyValue = { capabilities };
    await permissionService.setPolicy(organizationId, REQUIRE_APPROVAL_POLICY_KEY, value as unknown as Record<string, unknown>);
  },

  /** Phase 6's requires_approval() RPC — true if the org's governance
   * policy currently names this capability. */
  async isApprovalRequired(organizationId: string, capability: string): Promise<boolean> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('requires_approval', { p_organization_id: organizationId, p_capability: capability });
    if (error) throw error;
    return Boolean(data);
  },
};
