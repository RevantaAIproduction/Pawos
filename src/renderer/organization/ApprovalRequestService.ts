import { getSupabaseClient } from '../auth/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ApprovalRequest, ApprovalRequestStatus } from '../../shared/organization/GovernanceTypes';

type ApprovalRequestRow = {
  id: string;
  organization_id: string;
  requested_by: string;
  capability: string;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  status: ApprovalRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

function toApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    requestedBy: row.requested_by,
    capability: row.capability,
    actionType: row.action_type,
    summary: row.summary,
    payload: row.payload,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

/**
 * Phase 6's generalized approval workflow — direct-Supabase pattern
 * matching RemoteAssistanceService/ControlGrantService, generalizing
 * Section 5's request/notify/decide state machine to any governance-gated
 * capability instead of just remote assistance.
 */
export const approvalRequestService = {
  async request(organizationId: string, capability: string, actionType: string, summary: string, payload: Record<string, unknown> = {}): Promise<ApprovalRequest> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('organization_approval_requests')
      .insert({ organization_id: organizationId, requested_by: userId, capability, action_type: actionType, summary, payload })
      .select('*')
      .single<ApprovalRequestRow>();
    if (error) throw error;
    return toApprovalRequest(data);
  },

  async listPending(organizationId: string): Promise<ApprovalRequest[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_approval_requests')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .returns<ApprovalRequestRow[]>();
    if (error) throw error;
    return (data ?? []).map(toApprovalRequest);
  },

  /** This user's own requests, most recent first — so a requester can see
   * whether their pending action has been decided without polling the
   * pending-only queue (which drops a row the moment it's decided). */
  async listMine(organizationId: string, limit = 20): Promise<ApprovalRequest[]> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from('organization_approval_requests')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('requested_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<ApprovalRequestRow[]>();
    if (error) throw error;
    return (data ?? []).map(toApprovalRequest);
  },

  /** RLS requires approvals.decide; also rejects (0 rows matched) if the
   * request is no longer pending, so two approvers can't race on one row. */
  async decide(requestId: string, decision: 'approved' | 'denied'): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('organization_approval_requests')
      .update({ status: decision, decided_by: userData.user?.id ?? null, decided_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending');
    if (error) throw error;
  },

  /** Live subscription over the whole org's approval-requests table —
   * same proven-reliable filter shape as RemoteAssistanceService's
   * subscribeToOpenRequests (organization_id=eq., event '*'), not the
   * per-row id filter that Phase 5's Bug #4 showed was unreliable. */
  subscribeToRequests(organizationId: string, onChange: () => void): () => void {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    getSupabaseClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`approval-requests:${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_approval_requests',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => onChange()
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  },
};
