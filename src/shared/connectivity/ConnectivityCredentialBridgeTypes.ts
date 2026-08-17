import type { AuthMethod, ConnectivityScope } from './ConnectivityTypes';

export const CONNECTIVITY_CREDENTIAL_PERSIST_REQUEST_CHANNEL = 'connectivityCredential:persistRequest';
export const CONNECTIVITY_CREDENTIAL_PERSIST_RESPONSE_CHANNEL_PREFIX = 'connectivityCredential:persistResponse';
export const CONNECTIVITY_CREDENTIAL_REVOKE_REQUEST_CHANNEL = 'connectivityCredential:revokeRequest';
export const CONNECTIVITY_CREDENTIAL_REVOKE_RESPONSE_CHANNEL_PREFIX = 'connectivityCredential:revokeResponse';

/**
 * P0-4 security fix. The main process holds no Supabase session (confirmed: no
 * `createClient()` call exists anywhere under `src/main`), so it cannot durably persist an OAuth
 * credential itself — only the renderer's already-authenticated `connectivityCredentialService`
 * (Supabase Vault-backed, see `20260726010000_connectivity_credentials_vault.sql`) can. This is the
 * main->renderer request/response bridge that makes that round trip, mirroring
 * `OrganizationUsageBridgeTypes.ts`'s already-proven pattern exactly.
 */
export type ConnectivityCredentialPersistRequest = {
  requestId: string;
  scope: ConnectivityScope;
  connectorId: string;
  authMethod: AuthMethod;
  secret: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type ConnectivityCredentialPersistResponse = { ok: true } | { ok: false; message: string };

export type ConnectivityCredentialRevokeRequest = {
  requestId: string;
  scope: ConnectivityScope;
  connectorId: string;
};

export type ConnectivityCredentialRevokeResponse = { ok: true } | { ok: false; message: string };
