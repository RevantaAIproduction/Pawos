import { getSupabaseClient } from '../auth/supabaseClient';
import type { ConnectorConnection, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

type ConnectivityConnectionRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  connector_id: string;
  connection_id: string;
  status: ConnectorConnection['status'];
  granted_permissions: string[];
  last_sync_at: string | null;
  last_health_check_at: string | null;
  health_status: ConnectorConnection['healthStatus'] | null;
  metadata: Record<string, unknown>;
};

function toConnection(row: ConnectivityConnectionRow): ConnectorConnection {
  return {
    id: row.connection_id,
    connectorId: row.connector_id,
    scope: { userId: row.user_id, organizationId: row.organization_id ?? undefined },
    status: row.status,
    grantedPermissions: row.granted_permissions ?? [],
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).getTime() : undefined,
    lastHealthCheckAt: row.last_health_check_at ? new Date(row.last_health_check_at).getTime() : undefined,
    healthStatus: row.health_status ?? undefined,
    metadata: row.metadata ?? {},
  };
}

/**
 * Section 17's persistence layer for `ConnectionManager` (main process,
 * still entirely in-memory — this file is what makes that survive a
 * restart). Direct-Supabase pattern, matching every other renderer
 * service in this codebase — no secret ever lives in this table, so no
 * RPC/encryption is needed here (unlike ConnectivityCredentialService).
 *
 * `ConnectionManager`'s own public API is untouched: this service is
 * called ALONGSIDE the existing `ipc.connectivityConnect`/`Disconnect`/
 * `CheckHealth` calls at their real call sites (see
 * IntegrationsSettingsPage.tsx), never instead of them — main still does
 * 100% of the real connector work; this only mirrors the resulting state
 * into Supabase so a future app launch can hydrate it back.
 */
export const connectionManagerService = {
  async list(scope: ConnectivityScope): Promise<ConnectorConnection[]> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('connectivity_connections').select('*').eq('user_id', scope.userId);
    query = scope.organizationId ? query.eq('organization_id', scope.organizationId) : query.is('organization_id', null);
    const { data, error } = await query.returns<ConnectivityConnectionRow[]>();
    if (error) throw error;
    return (data ?? []).map(toConnection);
  },

  /** Upserts by (scope, connectorId) — manual select-then-write rather than
   *  `.upsert()`, since the uniqueness constraint is two partial indexes
   *  (organization_id is/isn't null) that Postgres' ON CONFLICT target
   *  inference can't cleanly express through the supabase-js client. */
  async upsert(scope: ConnectivityScope, connection: ConnectorConnection): Promise<void> {
    const supabase = await getSupabaseClient();
    let existingQuery = supabase
      .from('connectivity_connections')
      .select('id')
      .eq('user_id', scope.userId)
      .eq('connector_id', connection.connectorId);
    existingQuery = scope.organizationId ? existingQuery.eq('organization_id', scope.organizationId) : existingQuery.is('organization_id', null);
    const { data: existing, error: selectError } = await existingQuery.maybeSingle<{ id: string }>();
    if (selectError) throw selectError;

    const row = {
      user_id: scope.userId,
      organization_id: scope.organizationId ?? null,
      connector_id: connection.connectorId,
      connection_id: connection.id,
      status: connection.status,
      granted_permissions: connection.grantedPermissions,
      last_sync_at: connection.lastSyncAt ? new Date(connection.lastSyncAt).toISOString() : null,
      last_health_check_at: connection.lastHealthCheckAt ? new Date(connection.lastHealthCheckAt).toISOString() : null,
      health_status: connection.healthStatus ?? null,
      metadata: connection.metadata,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from('connectivity_connections').update(row).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('connectivity_connections').insert(row);
      if (error) throw error;
    }
  },

  async remove(scope: ConnectivityScope, connectorId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('connectivity_connections').delete().eq('user_id', scope.userId).eq('connector_id', connectorId);
    query = scope.organizationId ? query.eq('organization_id', scope.organizationId) : query.is('organization_id', null);
    const { error } = await query;
    if (error) throw error;
  },
};
