import type { AuthMethod, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

export interface StoredCredential {
  connectorId: string;
  scope: ConnectivityScope;
  secret: string;
  authMethod: AuthMethod;
  refreshToken?: string;
  expiresAt?: number;
  updatedAt: number;
}

function scopeSuffix(scope: ConnectivityScope): string {
  return `${scope.userId}:${scope.organizationId ?? ''}`;
}

function credentialKey(connectorId: string, scope: ConnectivityScope): string {
  return `${connectorId}::${scopeSuffix(scope)}`;
}

/**
 * The bridge every other manager in this runtime (OAuth Manager, API Token
 * Manager, and any future connector adapter) depends on for reading/writing
 * a connector's secret — generic over `ConnectivityScope`, so the exact
 * same API serves a solo user (`{userId}`) and an org member
 * (`{userId, organizationId}`) without a special case for either.
 *
 * This is deliberately additive to, and never touches, the existing
 * Organization Credential Vault (`organization_credentials` table,
 * `CredentialVaultService.ts`, `ApplyOrganizationCredentialPlugin.ts`) —
 * that system keeps working exactly as it does today for the features
 * already built on it.
 *
 * Persistence note (the same deliberate scope boundary as
 * `ConnectionManager.ts`): the architecture calls for a
 * `connectivity_credentials` Supabase table (Section 17's migration, not
 * yet built), with `pgcrypto` encryption happening inside `security
 * definer` RPCs — exactly the pattern `store_organization_credential`
 * already uses. Since only the renderer holds a Supabase session (no
 * main-process Supabase client exists anywhere in this codebase — the
 * reason the org vault itself crosses into the renderer to do its real
 * work), this main-process bridge holds credentials in-memory for now
 * rather than inventing a second, throwaway encryption scheme that would
 * just be replaced once the real Supabase-backed renderer service exists.
 * This is the same risk class as every existing connector already holding
 * its own token as a plain constructor field for the process's lifetime
 * (`GitHubSourceControlConnector`, `JiraConnector`, etc.) — not a new
 * exposure. The public API below is already the final shape; only
 * `store()`/`read()`/`rotate()`/`revoke()`'s internals change once Section
 * 17 lands, nothing above this layer needs to.
 */
class CredentialVaultBridge {
  private credentials = new Map<string, StoredCredential>();

  async store(
    connectorId: string,
    scope: ConnectivityScope,
    secret: string,
    authMethod: AuthMethod,
    opts?: { refreshToken?: string; expiresAt?: number }
  ): Promise<void> {
    this.credentials.set(credentialKey(connectorId, scope), {
      connectorId,
      scope,
      secret,
      authMethod,
      refreshToken: opts?.refreshToken,
      expiresAt: opts?.expiresAt,
      updatedAt: Date.now(),
    });
  }

  async read(connectorId: string, scope: ConnectivityScope): Promise<StoredCredential | undefined> {
    return this.credentials.get(credentialKey(connectorId, scope));
  }

  async rotate(connectorId: string, scope: ConnectivityScope, newSecret: string): Promise<void> {
    const existing = this.credentials.get(credentialKey(connectorId, scope));
    if (!existing) {
      throw new Error(`Cannot rotate — no credential stored for connector '${connectorId}' in this scope.`);
    }
    this.credentials.set(credentialKey(connectorId, scope), { ...existing, secret: newSecret, updatedAt: Date.now() });
  }

  async revoke(connectorId: string, scope: ConnectivityScope): Promise<void> {
    this.credentials.delete(credentialKey(connectorId, scope));
  }
}

export const credentialVaultBridge = new CredentialVaultBridge();
