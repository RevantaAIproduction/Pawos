import { getSupabaseClient } from '../auth/supabaseClient';
import type { OrganizationCreditPool, OrganizationCreditAllocation, OrganizationCreditUsageEvent, OrganizationCreditSummary } from '../../shared/organization/CreditPoolTypes';

type PoolRow = {
  id: string;
  organization_id: string;
  total_credits: number;
  period_resets_at: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};
type AllocationRow = {
  id: string;
  organization_id: string;
  allocation_type: OrganizationCreditAllocation['allocationType'];
  target_user_id: string | null;
  department_name: string | null;
  allocated_credits: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type UsageRow = { id: string; organization_id: string; user_id: string; amount: number; reason: string | null; created_at: string };

function toPool(row: PoolRow): OrganizationCreditPool {
  return {
    id: row.id,
    organizationId: row.organization_id,
    totalCredits: row.total_credits,
    periodResetsAt: row.period_resets_at,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAllocation(row: AllocationRow): OrganizationCreditAllocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    allocationType: row.allocation_type,
    targetUserId: row.target_user_id,
    departmentName: row.department_name,
    allocatedCredits: row.allocated_credits,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUsageEvent(row: UsageRow): OrganizationCreditUsageEvent {
  return { id: row.id, organizationId: row.organization_id, userId: row.user_id, amount: row.amount, reason: row.reason, createdAt: row.created_at };
}

/**
 * Phase 1 — organization credit pools. A pool row is auto-seeded per
 * organization by the migration's trigger (starts at 0 credits until an
 * admin sets a real total). Additive only: Individual/Guest accounts have
 * no organizationId and never touch this service; the local CreditStore
 * (main process) is untouched.
 */
export const creditPoolService = {
  async getPool(organizationId: string): Promise<OrganizationCreditPool | null> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('organization_credit_pools').select('*').eq('organization_id', organizationId).maybeSingle<PoolRow>();
    if (error) throw error;
    return data ? toPool(data) : null;
  },

  /** RLS rejects this unless the caller holds credits.manage. */
  async setPoolTotal(organizationId: string, totalCredits: number): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('organization_credit_pools')
      .update({ total_credits: totalCredits, updated_by: userData.user?.id ?? null, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);
    if (error) throw error;
  },

  async listAllocations(organizationId: string): Promise<OrganizationCreditAllocation[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_credit_allocations')
      .select('*')
      .eq('organization_id', organizationId)
      .returns<AllocationRow[]>();
    if (error) throw error;
    return (data ?? []).map(toAllocation);
  },

  /** RLS rejects this unless the caller holds credits.manage. */
  async allocateToMember(organizationId: string, targetUserId: string, allocatedCredits: number): Promise<OrganizationCreditAllocation> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_credit_allocations')
      .insert({ organization_id: organizationId, allocation_type: 'member', target_user_id: targetUserId, allocated_credits: allocatedCredits, created_by: userData.user?.id ?? null })
      .select('*')
      .single<AllocationRow>();
    if (error) throw error;
    return toAllocation(data);
  },

  async allocateToDepartment(organizationId: string, departmentName: string, allocatedCredits: number): Promise<OrganizationCreditAllocation> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_credit_allocations')
      .insert({ organization_id: organizationId, allocation_type: 'department', department_name: departmentName, allocated_credits: allocatedCredits, created_by: userData.user?.id ?? null })
      .select('*')
      .single<AllocationRow>();
    if (error) throw error;
    return toAllocation(data);
  },

  async recordUsage(organizationId: string, amount: number, reason?: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('organization_credit_usage_events')
      .insert({ organization_id: organizationId, user_id: userData.user?.id, amount, reason: reason ?? null });
    if (error) throw error;
  },

  /** Own usage this billing period; credits.manage holders get every
   * member's events instead (RLS-enforced, not client-filtered). */
  async listUsageEvents(organizationId: string, limit = 100): Promise<OrganizationCreditUsageEvent[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_credit_usage_events')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<UsageRow[]>();
    if (error) throw error;
    return (data ?? []).map(toUsageEvent);
  },

  async getSummary(organizationId: string): Promise<OrganizationCreditSummary> {
    const [pool, allocations, usageEvents] = await Promise.all([
      creditPoolService.getPool(organizationId),
      creditPoolService.listAllocations(organizationId),
      creditPoolService.listUsageEvents(organizationId),
    ]);
    const usedThisPeriod = usageEvents.reduce((sum, e) => sum + e.amount, 0);
    const remaining = pool ? pool.totalCredits - usedThisPeriod : null;
    return { pool, allocations, usedThisPeriod, remaining };
  },
};
