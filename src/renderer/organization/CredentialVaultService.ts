import { getSupabaseClient } from '../auth/supabaseClient';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { OrgCredential, OrgCredentialConnectorKind } from '../../shared/organization/GovernanceTypes';

type OrgCredentialRow = {
  id: string;
  organization_id: string;
  connector_kind: OrgCredentialConnectorKind;
  connector_id: string;
  label: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toCredential(row: OrgCredentialRow): OrgCredential {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectorKind: row.connector_kind,
    connectorId: row.connector_id,
    label: row.label,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Phase 6's org-scoped infrastructure credential vault — direct-Supabase
 * pattern matching every other org service. Never handles a plaintext
 * secret except transiently: store()/read() call security-definer RPCs
 * that encrypt/decrypt server-side with pgcrypto, so the plaintext only
 * ever exists in a single request/response round trip, not in this
 * service's own state.
 */
export const credentialVaultService = {
  /** Metadata only — never the secret. Safe to list broadly (RLS already
   * restricts to org members); the encrypted_secret column is never
   * selected here at all. */
  async list(organizationId: string): Promise<OrgCredential[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_credentials')
      .select('id, organization_id, connector_kind, connector_id, label, created_by, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('label', { ascending: true })
      .returns<OrgCredentialRow[]>();
    if (error) throw error;
    return (data ?? []).map(toCredential);
  },

  /** Encrypts `secret` server-side and stores it; RLS/RPC both require
   * credentials.manage. Upserts on (organization_id, connector_kind, connector_id). */
  async store(organizationId: string, connectorKind: OrgCredentialConnectorKind, connectorId: string, label: string, secret: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('store_organization_credential', {
      p_organization_id: organizationId,
      p_connector_kind: connectorKind,
      p_connector_id: connectorId,
      p_label: label,
      p_secret: secret,
    });
    if (error) throw error;
  },

  /** Decrypts and returns the plaintext secret, or null if none is stored
   * for this connector. Requires credentials.manage — the same gate as
   * storing one, since reading plaintext is equally sensitive. */
  async read(organizationId: string, connectorKind: OrgCredentialConnectorKind, connectorId: string): Promise<string | null> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('read_organization_credential', {
      p_organization_id: organizationId,
      p_connector_kind: connectorKind,
      p_connector_id: connectorId,
    });
    if (error) throw error;
    return (data as string | null) ?? null;
  },

  /** Pulls every credential this org has shared down to this device's own
   * local connectors (via applyOrganizationCredential → connector.setToken()).
   * Best-effort per credential: one failing (e.g. a connector that doesn't
   * accept a runtime token) never blocks the rest. Meant to run once per
   * org load, not on every render. */
  async applyAllToLocalConnectors(organizationId: string): Promise<void> {
    const credentials = await this.list(organizationId);
    for (const cred of credentials) {
      try {
        const secret = await this.read(organizationId, cred.connectorKind, cred.connectorId);
        if (!secret) continue;
        await ipc.actionExecute({ type: 'applyOrganizationCredential', connectorKind: cred.connectorKind, connectorId: cred.connectorId, secret });
      } catch {
        // best-effort — a member without credentials.manage simply can't decrypt yet if RLS changes later
      }
    }
  },

  async revoke(organizationId: string, connectorKind: OrgCredentialConnectorKind, connectorId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_credentials')
      .delete()
      .eq('organization_id', organizationId)
      .eq('connector_kind', connectorKind)
      .eq('connector_id', connectorId);
    if (error) throw error;
  },
};
