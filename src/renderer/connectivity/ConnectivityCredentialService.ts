import { getSupabaseClient } from '../auth/supabaseClient';
import type { AuthMethod, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

export interface ConnectivityCredentialMetadata {
  connectorId: string;
  authMethod: AuthMethod;
  expiresAt?: number;
  updatedAt: number;
}

export interface DecryptedConnectivityCredential {
  authMethod: AuthMethod;
  secret: string;
  refreshToken?: string;
  expiresAt?: number;
}

type ConnectivityCredentialMetaRow = {
  connector_id: string;
  auth_method: AuthMethod;
  expires_at: string | null;
  updated_at: string;
};

type ReadConnectivityCredentialRow = {
  auth_method: AuthMethod;
  secret: string;
  refresh_token: string | null;
  expires_at: string | null;
};

/**
 * Section 17's persistence layer for `CredentialVaultBridge` (main
 * process, still entirely in-memory). Mirrors `CredentialVaultService.ts`
 * (Phase 6's org vault) exactly: metadata-only direct select is safe to
 * expose broadly (ciphertext without the server-side key is harmless),
 * but store()/read() always go through security-definer RPCs — the only
 * place `pgcrypto` encrypt/decrypt ever happens. This is deliberately a
 * separate table/service from the org vault; neither touches the other.
 */
export const connectivityCredentialService = {
  /** Never returns a secret — just which connectors have a stored
   *  credential, for hydration to decide what's worth decrypting. */
  async listMetadata(scope: ConnectivityScope): Promise<ConnectivityCredentialMetadata[]> {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('connectivity_credentials')
      .select('connector_id, auth_method, expires_at, updated_at')
      .eq('user_id', scope.userId);
    query = scope.organizationId ? query.eq('organization_id', scope.organizationId) : query.is('organization_id', null);
    const { data, error } = await query.returns<ConnectivityCredentialMetaRow[]>();
    if (error) throw error;
    return (data ?? []).map((row) => ({
      connectorId: row.connector_id,
      authMethod: row.auth_method,
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  },

  async store(
    scope: ConnectivityScope,
    connectorId: string,
    authMethod: AuthMethod,
    secret: string,
    opts?: { refreshToken?: string; expiresAt?: number }
  ): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('store_connectivity_credential', {
      p_connector_id: connectorId,
      p_organization_id: scope.organizationId ?? null,
      p_auth_method: authMethod,
      p_secret: secret,
      p_refresh_token: opts?.refreshToken ?? null,
      p_expires_at: opts?.expiresAt ? new Date(opts.expiresAt).toISOString() : null,
    });
    if (error) throw error;
  },

  /** Decrypts and returns the stored credential, or null if nothing is
   *  stored for this connector — matches CredentialVaultBridge.read()'s
   *  own `StoredCredential | undefined` semantics (never throws for
   *  "not found"). */
  async read(scope: ConnectivityScope, connectorId: string): Promise<DecryptedConnectivityCredential | null> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('read_connectivity_credential', {
      p_connector_id: connectorId,
      p_organization_id: scope.organizationId ?? null,
    });
    if (error) throw error;
    const row = (data as ReadConnectivityCredentialRow[] | null)?.[0];
    if (!row) return null;
    return {
      authMethod: row.auth_method,
      secret: row.secret,
      refreshToken: row.refresh_token ?? undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
    };
  },

  async revoke(scope: ConnectivityScope, connectorId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('connectivity_credentials').delete().eq('user_id', scope.userId).eq('connector_id', connectorId);
    query = scope.organizationId ? query.eq('organization_id', scope.organizationId) : query.is('organization_id', null);
    const { error } = await query;
    if (error) throw error;
  },
};
