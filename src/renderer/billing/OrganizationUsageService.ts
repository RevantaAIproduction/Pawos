import { getSupabaseClient } from '../auth/supabaseClient';
import { TRACKED_USAGE_CAPABILITIES } from '../../shared/billing/UsageEngineTypes';
import type { CapabilityUsageSummary, UsageCapability } from '../../shared/billing/UsageEngineTypes';

/**
 * Enterprise's pooled half of the Usage & Entitlement Engine — direct-Supabase
 * pattern matching CredentialVaultService.ts/ApprovalRequestService.ts.
 * Unlike the local, per-account UsageEngine.ts (main process), this is the
 * AUTHORITATIVE enforcement point for pooled Enterprise usage:
 * increment_organization_usage() looks the configured limit up itself from
 * usage_quota_config and raises a real Postgres exception if the pool is
 * exhausted, so it can never be bypassed by a client sending a fabricated
 * "usage" number — a stronger guarantee than the main-process trust model
 * used for non-pooled tiers, appropriate since multiple org members'
 * separate desktop installs all draw from the same pool.
 *
 * Callers on a pooled (Enterprise) tier must call recordUsage() here BEFORE
 * dispatching the action, and treat a thrown error as "usage limit reached"
 * — see UsageEngine.ts's canConsume() return shape, which signals
 * `{pooled: true, deferTo: 'organizationUsageService'}` for exactly this
 * reason. This includes 'aiReasoning' (Paw Compute's conversation-turn
 * capability) — see useConversationController.ts, which calls this instead
 * of the local CreditStore-backed IPC path whenever
 * EntitlementSnapshot.pooled is true.
 */
export const organizationUsageService = {
  /** Throws if the organization has exhausted its pool for this capability this period — never returns a false "allowed" the way a client-side-only check could. */
  async recordUsage(organizationId: string, capability: UsageCapability, amount = 1): Promise<{ usedAmount: number; monthlyLimit: number | null }> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('increment_organization_usage', {
      p_organization_id: organizationId,
      p_capability: capability,
      p_amount: amount,
    });
    if (error) throw error;
    const row = (data as { used_amount: number; monthly_limit: number | null }[] | null)?.[0];
    return { usedAmount: row?.used_amount ?? amount, monthlyLimit: row?.monthly_limit ?? null };
  },

  /** Throws if the Enterprise API budget is exhausted. */
  async checkEnterpriseApiBudget(organizationId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('organizations').select('api_budget_usd, api_usage_usd').eq('id', organizationId).single();
    if (error) throw error;
    if (data.api_usage_usd >= data.api_budget_usd) {
      throw new Error('Enterprise API budget exceeded');
    }
  },

  /** Records actual USD cost against the Enterprise API budget. */
  async recordEnterpriseApiUsage(organizationId: string, costUsd: number): Promise<boolean> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('record_enterprise_api_usage', {
      p_org_id: organizationId,
      p_cost_usd: costUsd,
    });
    if (error) throw error;
    return !!data;
  },

  /** Read-only view for a usage dashboard — does not itself enforce anything. */
  async getSummary(organizationId: string): Promise<CapabilityUsageSummary[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('get_organization_usage_summary', { p_organization_id: organizationId });
    if (error) throw error;
    const rows = (data as { capability: string; used_amount: number; monthly_limit: number | null }[] | null) ?? [];
    const byCapability = new Map(rows.map((r) => [r.capability, r]));
    const periodResetsAt = (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    })();
    return TRACKED_USAGE_CAPABILITIES.map((capability) => {
      const row = byCapability.get(capability);
      return { capability, limit: row?.monthly_limit ?? null, used: row?.used_amount ?? 0, periodResetsAt, pooled: true };
    });
  },

  async consumeGoRefresh(deviceId: string): Promise<boolean> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('consume_go_refresh', { p_device_id: deviceId });
    if (error) throw error;
    return !!data;
  },

  async getGoRefreshesRemaining(deviceId: string): Promise<number> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('get_go_refreshes', { p_device_id: deviceId });
    if (error) return 0;
    return (data as number) ?? 0;
  }
};
