import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

const persistCredentialViaRenderer = vi.hoisted(() => vi.fn());
vi.mock('./RendererConnectivityCredentialBridge', () => ({
  persistCredentialViaRenderer,
  revokeCredentialViaRenderer: vi.fn(async () => ({ ok: true })),
}));

import { connectorRegistry } from './ConnectorRegistry';
import { connectionManager } from './ConnectionManager';
import { credentialVaultBridge } from './CredentialVaultBridge';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';

/**
 * persistStoredCredential() is how a connector's refreshed token reaches the durable store after
 * the initial connect — the window that restored (or connected) the credential is remembered and
 * reused, since the main process has no other route to Supabase.
 */
const scope = { userId: 'u-persist-test' };
const CONNECTOR_ID = 'persistFake';

const fakeSdk: ConnectorSDK = {
  definition: { id: CONNECTOR_ID, displayName: 'Fake', category: 'other', authMethod: 'oauth2', capabilities: [] },
  connect: vi.fn(),
  disconnect: vi.fn(),
  authenticate: async () => {},
  refresh: async () => {},
  validate: async () => ({ valid: true }),
  health: async () => ({ status: 'healthy' }),
  getStatus: async () => ({ state: 'connected', capabilities: [] }),
  capabilities: () => [],
  subscribe: () => () => {},
  unsubscribe: () => {},
  execute: async () => undefined,
};

const window = (destroyed = false) => ({ isDestroyed: () => destroyed }) as unknown as WebContents;

describe('ConnectionManager.persistStoredCredential()', () => {
  beforeEach(async () => {
    persistCredentialViaRenderer.mockReset().mockResolvedValue({ ok: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    connectorRegistry.register(fakeSdk);
    await credentialVaultBridge.store(CONNECTOR_ID, scope, 'access-2', 'oauth2', { refreshToken: 'refresh-2', expiresAt: 1_800_000_000_000 });
  });

  afterEach(async () => {
    connectorRegistry.unregister(CONNECTOR_ID);
    await credentialVaultBridge.revoke(CONNECTOR_ID, scope);
    vi.restoreAllMocks();
  });

  it('persists the vault credential — access token, refresh token and expiry — through the window that restored it', async () => {
    const sender = window();
    await connectionManager.restore(CONNECTOR_ID, scope, { accessToken: 'access-1' }, sender);

    expect(await connectionManager.persistStoredCredential(CONNECTOR_ID, scope)).toBe(true);
    expect(persistCredentialViaRenderer).toHaveBeenCalledWith(sender, scope, CONNECTOR_ID, 'oauth2', 'access-2', {
      refreshToken: 'refresh-2',
      expiresAt: 1_800_000_000_000,
    });
  });

  it('reports failure, without throwing, when the durable store rejects the write', async () => {
    await connectionManager.restore(CONNECTOR_ID, scope, { accessToken: 'access-1' }, window());
    persistCredentialViaRenderer.mockResolvedValue({ ok: false, message: 'offline' });

    expect(await connectionManager.persistStoredCredential(CONNECTOR_ID, scope)).toBe(false);
  });

  it('does nothing when the window is gone or the vault holds nothing for the connector', async () => {
    await connectionManager.restore(CONNECTOR_ID, scope, { accessToken: 'access-1' }, window(true));
    expect(await connectionManager.persistStoredCredential(CONNECTOR_ID, scope)).toBe(false);

    await connectionManager.restore(CONNECTOR_ID, scope, { accessToken: 'access-1' }, window());
    expect(await connectionManager.persistStoredCredential('nothingStored', scope)).toBe(false);
    expect(persistCredentialViaRenderer).not.toHaveBeenCalled();
  });
});
