import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import type {
  ControlGrant,
  ControlGrantKind,
  ControlGrantStatus,
  RemoteAssistanceSession,
  RemoteAssistanceStatus,
  ShareScope,
} from '../../shared/organization/RemoteAssistanceTypes';

type SessionRow = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  requester_user_id: string;
  helper_user_id: string | null;
  status: RemoteAssistanceStatus;
  share_scope: ShareScope | null;
  share_source_id: string | null;
  requested_at: string;
  joined_at: string | null;
  ended_at: string | null;
};

type GrantRow = {
  id: string;
  organization_id: string;
  session_id: string;
  kind: ControlGrantKind;
  status: ControlGrantStatus;
  requested_by: string;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
  revoked_at: string | null;
};

function toSession(row: SessionRow): RemoteAssistanceSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    requesterUserId: row.requester_user_id,
    helperUserId: row.helper_user_id,
    status: row.status,
    shareScope: row.share_scope,
    shareSourceId: row.share_source_id,
    requestedAt: row.requested_at,
    joinedAt: row.joined_at,
    endedAt: row.ended_at,
  };
}

function toGrant(row: GrantRow): ControlGrant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sessionId: row.session_id,
    kind: row.kind,
    status: row.status,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Phase 5 — Remote Assistance & Screen Sharing/Remote Control. Direct-
 * Supabase pattern, same as every prior organization service. Models the
 * roadmap's Section 5 state machine (request → notify → join → staged
 * control escalation → end) and Section 6's per-permission control grants.
 *
 * Deliberate RLS deviation (disclosed in the migration): unlike every
 * other Phase 0-4 table, these two tables give the org owner no blanket
 * bypass — remote control of a member's own machine is a personal consent
 * action, not organizational data ownership.
 */
export const remoteAssistanceService = {
  async requestAssistance(organizationId: string, workspaceId: string | null): Promise<RemoteAssistanceSession> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_remote_assistance_sessions')
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        requester_user_id: userData.user?.id,
        status: 'requested',
      })
      .select('*')
      .single<SessionRow>();
    if (error) throw error;
    return toSession(data);
  },

  /** Open requests visible to anyone with remote_assistance.provide (per RLS) — used to populate an admin's "help requests" list. */
  async listOpenRequests(organizationId: string): Promise<RemoteAssistanceSession[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_remote_assistance_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['requested', 'notified'])
      .order('requested_at', { ascending: false })
      .returns<SessionRow[]>();
    if (error) throw error;
    return (data ?? []).map(toSession);
  },

  /**
   * Resume-on-remount: finds this user's own still-open session (as either
   * requester or helper) so a page reload/renavigation doesn't orphan an
   * in-flight request — without this, the panel would lose all access to
   * an existing 'requested'/'notified'/'active' session and a repeat click
   * on "Request help" would insert a duplicate row.
   */
  async getMyActiveSession(organizationId: string): Promise<RemoteAssistanceSession | null> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('organization_remote_assistance_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['requested', 'notified', 'active'])
      .or(`requester_user_id.eq.${userId},helper_user_id.eq.${userId}`)
      .order('requested_at', { ascending: false })
      .limit(1)
      .returns<SessionRow[]>();
    if (error) throw error;
    return data && data.length > 0 ? toSession(data[0]) : null;
  },

  async getSession(sessionId: string): Promise<RemoteAssistanceSession> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_remote_assistance_sessions')
      .select('*')
      .eq('id', sessionId)
      .single<SessionRow>();
    if (error) throw error;
    return toSession(data);
  },

  /**
   * Admin claims an open request — sets helper_user_id and flips status to
   * notified/joined once the requester sees them arrive. Guarded to only
   * match a still-open, unclaimed row (`status` still requested/notified,
   * `helper_user_id` still null) — without this, a stale "Open help
   * requests" list entry (e.g. a session someone already ended, or another
   * helper already claimed) could be blindly resurrected/hijacked by an
   * unconditional update-by-id. A caller hitting a stale row now gets a real
   * "no rows matched" error instead of silently overwriting an ended session.
   */
  async joinAsHelper(sessionId: string): Promise<RemoteAssistanceSession> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_remote_assistance_sessions')
      .update({ helper_user_id: userData.user?.id, status: 'notified', joined_at: new Date().toISOString() })
      .eq('id', sessionId)
      .in('status', ['requested', 'notified'])
      .is('helper_user_id', null)
      .select('*')
      .single<SessionRow>();
    if (error) throw error;
    return toSession(data);
  },

  async activateSession(sessionId: string, shareScope: ShareScope, shareSourceId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_remote_assistance_sessions')
      .update({ status: 'active', share_scope: shareScope, share_source_id: shareSourceId })
      .eq('id', sessionId);
    if (error) throw error;
  },

  async declineSession(sessionId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_remote_assistance_sessions')
      .update({ status: 'declined' })
      .eq('id', sessionId);
    if (error) throw error;
  },

  async endSession(sessionId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_remote_assistance_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw error;
  },

  async listGrants(sessionId: string): Promise<ControlGrant[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_control_grants')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .returns<GrantRow[]>();
    if (error) throw error;
    return (data ?? []).map(toGrant);
  },

  /** The helper requests a permission tier — never self-granted. */
  async requestGrant(organizationId: string, sessionId: string, kind: ControlGrantKind): Promise<ControlGrant> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_control_grants')
      .upsert(
        {
          organization_id: organizationId,
          session_id: sessionId,
          kind,
          status: 'requested',
          requested_by: userData.user?.id,
          decided_by: null,
          decided_at: null,
          revoked_at: null,
        },
        { onConflict: 'session_id,kind' }
      )
      .select('*')
      .single<GrantRow>();
    if (error) throw error;
    return toGrant(data);
  },

  /** Only the requester (the person whose machine is being controlled) can approve or deny. */
  async decideGrant(grantId: string, decision: 'granted' | 'denied'): Promise<ControlGrant> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_control_grants')
      .update({ status: decision, decided_by: userData.user?.id, decided_at: new Date().toISOString() })
      .eq('id', grantId)
      .select('*')
      .single<GrantRow>();
    if (error) throw error;
    return toGrant(data);
  },

  /** Either party can revoke instantly — the client-side enforcement point is the live subscription below, not this call itself. */
  async revokeGrant(grantId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_control_grants')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', grantId);
    if (error) throw error;
  },

  /**
   * Live subscription for instant revoke: fires on every insert/update to
   * this session's control grants so the UI (and the input-injection layer)
   * can react the instant a grant is revoked — no polling delay, matching
   * the roadmap's "sub-second in practice" design.
   */
  subscribeToGrants(sessionId: string, onChange: (grant: ControlGrant) => void): () => void {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    getSupabaseClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`control-grants:${sessionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'organization_control_grants', filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as GrantRow | undefined;
            if (row) onChange(toGrant(row));
          }
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  },

  /**
   * Live subscription for the open-requests queue: fires on every insert/
   * update to this org's sessions so an eligible helper's "Open help
   * requests" list picks up a new request (or one being claimed/ended by
   * someone else) without requiring a manual reload.
   */
  subscribeToOpenRequests(organizationId: string, onChange: () => void): () => void {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    getSupabaseClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`remote-assistance-open-requests:${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_remote_assistance_sessions',
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

  /** Live subscription on the session row itself (status changes, helper joining). */
  subscribeToSession(
    sessionId: string,
    organizationId: string,
    onChange: (session: RemoteAssistanceSession) => void
  ): () => void {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    getSupabaseClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`remote-assistance-session:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_remote_assistance_sessions',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const row = payload.new as SessionRow | undefined;
            if (row && row.id === sessionId) onChange(toSession(row));
          }
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  },
};
