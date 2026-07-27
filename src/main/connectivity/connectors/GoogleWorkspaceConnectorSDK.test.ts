import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ safeStorage: { encryptString: vi.fn(), decryptString: vi.fn() }, app: { getPath: () => '/tmp' } }));

const beginAuthorization = vi.fn();
const exchangeCodeForToken = vi.fn();
const refreshAccessToken = vi.fn();
const revokeToken = vi.fn();

vi.mock('../OAuthManager', () => ({
  oauthManager: {
    beginAuthorization: (...args: unknown[]) => beginAuthorization(...args),
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForToken(...args),
    refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
    revokeToken: (...args: unknown[]) => revokeToken(...args),
    refreshAndPersist: vi.fn(),
  },
}));

vi.mock('../../infrastructure/GuestConnectorCredentialStore', () => ({
  guestConnectorCredentialStore: { save: vi.fn(), load: vi.fn(), remove: vi.fn() },
}));

import { GoogleWorkspaceConnectorSDK } from './GoogleWorkspaceConnectorSDK';
import { officeConnectorRegistry } from '../../office/OfficeConnectorRegistry';
import { credentialVaultBridge } from '../CredentialVaultBridge';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

describe('GoogleWorkspaceConnectorSDK — connection lifecycle', () => {
  const scope = { userId: 'u1' };
  let sdk: GoogleWorkspaceConnectorSDK;

  beforeEach(() => {
    sdk = new GoogleWorkspaceConnectorSDK();
    beginAuthorization.mockReset();
    exchangeCodeForToken.mockReset();
    revokeToken.mockReset();
  });

  afterEach(async () => {
    await credentialVaultBridge.revoke(sdk.definition.id, scope);
  });

  it('a full connect() populates the credential, registers office connectors, and reports full capabilities', async () => {
    beginAuthorization.mockReturnValue({
      requestId: 'r1',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      result: Promise.resolve({ code: 'code1', codeVerifier: 'verifier1' }),
    });
    exchangeCodeForToken.mockResolvedValue({
      accessToken: 'AT1',
      refreshToken: 'RT1',
      expiresAt: Date.now() + 3600_000,
      grantedScopes: [USERINFO_SCOPE, DRIVE_READONLY_SCOPE, CALENDAR_SCOPE, GMAIL_READONLY_SCOPE],
    });

    const connection = await sdk.connect(scope);

    expect(connection.status).toBe('connected');
    expect(sdk.capabilities()).toEqual(expect.arrayContaining(['listFiles', 'readFile', 'listEvents', 'listThreads']));
    expect(officeConnectorRegistry.firstConfigured('documentProvider')?.isConfigured()).toBe(true);
    expect(officeConnectorRegistry.firstConfigured('calendarProvider')?.isConfigured()).toBe(true);
    expect(officeConnectorRegistry.firstConfigured('mailboxProvider')?.isConfigured()).toBe(true);

    const stored = await credentialVaultBridge.read(sdk.definition.id, scope);
    expect(stored?.refreshToken).toBe('RT1');
    expect(stored?.grantedScopes).toEqual(expect.arrayContaining([CALENDAR_SCOPE, GMAIL_READONLY_SCOPE]));
  });

  it('capabilities() only reports what was actually granted, not the full declared set', async () => {
    beginAuthorization.mockReturnValue({
      requestId: 'r2',
      authorizationUrl: 'https://accounts.google.com/...',
      result: Promise.resolve({ code: 'code2', codeVerifier: 'verifier2' }),
    });
    exchangeCodeForToken.mockResolvedValue({
      accessToken: 'AT-cal-only',
      refreshToken: 'RT-cal-only',
      grantedScopes: [USERINFO_SCOPE, CALENDAR_SCOPE],
    });

    await sdk.connect(scope);

    const caps = sdk.capabilities();
    expect(caps).toEqual(expect.arrayContaining(['listEvents', 'createEvent']));
    expect(caps).not.toContain('listThreads');
    expect(caps).not.toContain('listFiles');
  });

  it('an incremental connect requests only the missing scope and merges it with what was already granted', async () => {
    // Start already connected with Calendar only.
    beginAuthorization.mockReturnValueOnce({
      requestId: 'r3',
      authorizationUrl: 'https://accounts.google.com/...',
      result: Promise.resolve({ code: 'code3', codeVerifier: 'verifier3' }),
    });
    exchangeCodeForToken.mockResolvedValueOnce({
      accessToken: 'AT-cal',
      refreshToken: 'RT-cal',
      grantedScopes: [USERINFO_SCOPE, CALENDAR_SCOPE],
    });
    await sdk.connect(scope);
    expect(sdk.capabilities()).not.toContain('listThreads');

    // Now request Gmail incrementally — simulate a provider whose incremental response echoes
    // back ONLY the newly granted scope (not the union), to prove the SDK computes the merge
    // itself rather than trusting the response.
    beginAuthorization.mockReturnValueOnce({
      requestId: 'r4',
      authorizationUrl: 'https://accounts.google.com/...',
      result: Promise.resolve({ code: 'code4', codeVerifier: 'verifier4' }),
    });
    exchangeCodeForToken.mockResolvedValueOnce({
      accessToken: 'AT-cal-gmail',
      refreshToken: 'RT-cal',
      grantedScopes: [GMAIL_READONLY_SCOPE],
    });

    await sdk.connect(scope, { incrementalCapabilities: ['listThreads'] });

    // Only the missing scope was requested — proving no full reconnect happened.
    const secondCall = beginAuthorization.mock.calls[1];
    if (!secondCall) throw new Error('Expected beginAuthorization to have been called a second time.');
    expect((secondCall[2] as { scopesOverride?: string[] } | undefined)?.scopesOverride).toEqual([GMAIL_READONLY_SCOPE]);

    // The merged capability set includes BOTH the original Calendar grant and the new Gmail one.
    const caps = sdk.capabilities();
    expect(caps).toEqual(expect.arrayContaining(['listEvents', 'listThreads']));

    const stored = await credentialVaultBridge.read(sdk.definition.id, scope);
    expect(stored?.grantedScopes).toEqual(expect.arrayContaining([CALENDAR_SCOPE, GMAIL_READONLY_SCOPE]));
  });

  it('disconnect revokes the token and clears every office connector', async () => {
    beginAuthorization.mockReturnValue({
      requestId: 'r5',
      authorizationUrl: 'https://accounts.google.com/...',
      result: Promise.resolve({ code: 'code5', codeVerifier: 'verifier5' }),
    });
    exchangeCodeForToken.mockResolvedValue({ accessToken: 'AT5', refreshToken: 'RT5', grantedScopes: [USERINFO_SCOPE, DRIVE_READONLY_SCOPE] });
    await sdk.connect(scope);
    expect(sdk.capabilities().length).toBeGreaterThan(0);

    await sdk.disconnect(scope);

    expect(revokeToken).toHaveBeenCalledWith(sdk.definition.id, 'AT5');
    expect(sdk.capabilities()).toEqual([]);
    expect(officeConnectorRegistry.get('documentProvider', 'googleDrive')?.isConfigured()).toBe(false);
    expect(officeConnectorRegistry.firstConfigured('documentProvider')).toBeUndefined();
    const stored = await credentialVaultBridge.read(sdk.definition.id, scope);
    expect(stored).toBeUndefined();
  });

  describe('getStatus() — strictly read-only lifecycle discovery', () => {
    it('reports disconnected with no capabilities before anything has connected, with zero OAuth calls', async () => {
      const status = await sdk.getStatus(scope);
      expect(status).toEqual({ state: 'disconnected', capabilities: [] });
      expect(beginAuthorization).not.toHaveBeenCalled();
      expect(exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('reflects connected state and live capabilities after connect(), without itself calling OAuth', async () => {
      beginAuthorization.mockReturnValue({
        requestId: 'status-r1',
        authorizationUrl: 'https://accounts.google.com/...',
        result: Promise.resolve({ code: 'status-code1', codeVerifier: 'status-verifier1' }),
      });
      exchangeCodeForToken.mockResolvedValue({
        accessToken: 'STATUS-AT1',
        refreshToken: 'STATUS-RT1',
        grantedScopes: [USERINFO_SCOPE, CALENDAR_SCOPE],
      });
      await sdk.connect(scope);
      beginAuthorization.mockClear();
      exchangeCodeForToken.mockClear();

      const status = await sdk.getStatus(scope);
      expect(status.state).toBe('connected');
      expect(status.capabilities).toEqual(expect.arrayContaining(['listEvents']));
      expect(status.connectedAt).toBeDefined();

      // Calling getStatus() repeatedly (simulating repeated Settings → Connections visits) must
      // never trigger a fresh OAuth round trip.
      await sdk.getStatus(scope);
      await sdk.getStatus(scope);
      expect(beginAuthorization).not.toHaveBeenCalled();
      expect(exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('authenticate() (the restore() primitive) activates a stored credential without opening OAuth', async () => {
      await sdk.authenticate(scope, {
        accessToken: 'RESTORED-AT',
        refreshToken: 'RESTORED-RT',
        grantedScopes: [USERINFO_SCOPE, DRIVE_READONLY_SCOPE],
      });

      const status = await sdk.getStatus(scope);
      expect(status.state).toBe('connected');
      expect(status.capabilities).toEqual(expect.arrayContaining(['listFiles']));
      expect(beginAuthorization).not.toHaveBeenCalled();
      expect(exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('reports disconnected again after disconnect()', async () => {
      beginAuthorization.mockReturnValue({
        requestId: 'status-r2',
        authorizationUrl: 'https://accounts.google.com/...',
        result: Promise.resolve({ code: 'status-code2', codeVerifier: 'status-verifier2' }),
      });
      exchangeCodeForToken.mockResolvedValue({ accessToken: 'STATUS-AT2', refreshToken: 'STATUS-RT2', grantedScopes: [USERINFO_SCOPE] });
      await sdk.connect(scope);
      await sdk.disconnect(scope);

      const status = await sdk.getStatus(scope);
      expect(status).toEqual({ state: 'disconnected', capabilities: [] });
    });
  });
});
