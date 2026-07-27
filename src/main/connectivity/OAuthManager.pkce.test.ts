import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from 'http';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

import { connectorRegistry } from './ConnectorRegistry';
import { credentialVaultBridge } from './CredentialVaultBridge';
import { oauthManager } from './OAuthManager';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';

function fakeConnector(id: string, opts?: { useLoopbackRedirect?: boolean; clientSecretEnvVar?: string }): ConnectorSDK {
  return {
    definition: {
      id,
      displayName: id,
      category: 'productivity',
      authMethod: 'oauth2',
      oauth: {
        authorizationUrl: 'https://example.test/authorize',
        tokenUrl: 'https://example.test/token',
        revocationUrl: 'https://example.test/revoke',
        usePkce: true,
        supportsIncrementalAuth: true,
        useLoopbackRedirect: opts?.useLoopbackRedirect,
        clientSecretEnvVar: opts?.clientSecretEnvVar,
        scopes: ['scope.a', 'scope.b'],
        clientIdEnvVar: 'FAKE_CLIENT_ID',
      },
      capabilities: ['a', 'b'],
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    authenticate: vi.fn(),
    refresh: vi.fn(),
    validate: vi.fn(),
    health: vi.fn(),
    getStatus: vi.fn(async () => ({ state: 'disconnected' as const, capabilities: [] })),
    capabilities: () => ['a', 'b'],
    subscribe: () => () => {},
    unsubscribe: () => {},
    execute: vi.fn(),
  };
}

/** Simulates the browser hitting the temporary loopback listener with Google's redirect —
 *  a real HTTP GET, deliberately bypassing the globally-stubbed `fetch` (which only stands in
 *  for OAuthManager's own token-endpoint calls, not this local server). */
function simulateRedirect(redirectUri: string, params: Record<string, string>): Promise<number> {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

describe('OAuthManager — generic PKCE infrastructure', () => {
  const scope = { userId: 'u1' };

  beforeEach(() => {
    process.env.FAKE_CLIENT_ID = 'test-client-id';
    connectorRegistry.register(fakeConnector('fake-oauth'));
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    connectorRegistry.unregister('fake-oauth');
    delete process.env.FAKE_CLIENT_ID;
    vi.unstubAllGlobals();
  });

  it('builds an authorize URL with a PKCE challenge and never leaks the verifier into it', () => {
    const { url, codeVerifier } = oauthManager.buildAuthorizationUrl('fake-oauth');
    expect(codeVerifier).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).not.toBe(codeVerifier);
    expect(url.toString()).not.toContain(codeVerifier!);
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
  });

  it('scopesOverride requests exactly those scopes instead of the full declared list', () => {
    const { url } = oauthManager.buildAuthorizationUrl('fake-oauth', { scopesOverride: ['scope.b'] });
    expect(url.searchParams.get('scope')).toBe('scope.b');
  });

  it('exchangeCodeForToken never sends a client secret and includes the code_verifier', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, scope: 'scope.a scope.b' }),
    });

    const result = await oauthManager.exchangeCodeForToken('fake-oauth', 'code123', 'verifier123');

    expect(result.accessToken).toBe('AT1');
    expect(result.refreshToken).toBe('RT1');
    expect(result.grantedScopes).toEqual(['scope.a', 'scope.b']);

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('Expected fetch to have been called.');
    const body = String((firstCall[1] as { body?: unknown } | undefined)?.body);
    expect(body).toContain('code_verifier=verifier123');
    expect(body).not.toContain('client_secret');
  });

  it('refreshAccessToken never sends a client secret', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT2', expires_in: 3600 }) });

    await oauthManager.refreshAccessToken('fake-oauth', 'RT1');

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('Expected fetch to have been called.');
    const body = String((firstCall[1] as { body?: unknown } | undefined)?.body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=RT1');
    expect(body).not.toContain('client_secret');
  });

  it('revokeToken posts to the declared revocationUrl', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true });

    await oauthManager.revokeToken('fake-oauth', 'AT1');

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/revoke', expect.objectContaining({ method: 'POST' }));
  });

  it('refreshAndPersist never overwrites a valid stored refresh token with an absent one', async () => {
    await credentialVaultBridge.store('fake-oauth', scope, 'AT-old', 'oauth2', {
      refreshToken: 'RT-original',
      grantedScopes: ['scope.a'],
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    // Simulates Google's normal refresh response — no refresh_token field at all.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT-new', expires_in: 3600 }) });

    const merged = await oauthManager.refreshAndPersist('fake-oauth', scope);

    expect(merged.accessToken).toBe('AT-new');
    expect(merged.refreshToken).toBe('RT-original');

    const stored = await credentialVaultBridge.read('fake-oauth', scope);
    expect(stored?.refreshToken).toBe('RT-original');
    expect(stored?.secret).toBe('AT-new');
  });

  it('refreshAndPersist rotates the refresh token when the provider actually issues a new one', async () => {
    await credentialVaultBridge.store('fake-oauth', scope, 'AT-old', 'oauth2', { refreshToken: 'RT-original' });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'AT-new', refresh_token: 'RT-rotated', expires_in: 3600 }),
    });

    const merged = await oauthManager.refreshAndPersist('fake-oauth', scope);
    expect(merged.refreshToken).toBe('RT-rotated');
  });
});

describe('OAuthManager — optional client_secret (Desktop-app clients that still require one)', () => {
  const scope = { userId: 'u1' };

  beforeEach(() => {
    process.env.FAKE_CLIENT_ID = 'test-client-id';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    connectorRegistry.unregister('fake-secret-oauth');
    delete process.env.FAKE_CLIENT_ID;
    delete process.env.FAKE_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it('includes client_secret in the token exchange when the connector declares clientSecretEnvVar', async () => {
    process.env.FAKE_CLIENT_SECRET = 'shh-its-not-really-secret';
    connectorRegistry.register(fakeConnector('fake-secret-oauth', { clientSecretEnvVar: 'FAKE_CLIENT_SECRET' }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT1', expires_in: 3600 }) });

    await oauthManager.exchangeCodeForToken('fake-secret-oauth', 'code123', 'verifier123');

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('Expected fetch to have been called.');
    const body = String((firstCall[1] as { body?: unknown } | undefined)?.body);
    expect(body).toContain('client_secret=shh-its-not-really-secret');
  });

  it('includes client_secret in refreshAccessToken too, under the same declared env var', async () => {
    process.env.FAKE_CLIENT_SECRET = 'shh-its-not-really-secret';
    connectorRegistry.register(fakeConnector('fake-secret-oauth', { clientSecretEnvVar: 'FAKE_CLIENT_SECRET' }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT1', expires_in: 3600 }) });

    await oauthManager.refreshAccessToken('fake-secret-oauth', 'RT1');

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('Expected fetch to have been called.');
    const body = String((firstCall[1] as { body?: unknown } | undefined)?.body);
    expect(body).toContain('client_secret=shh-its-not-really-secret');
  });

  it('throws clearly when clientSecretEnvVar is declared but the env var is unset', async () => {
    connectorRegistry.register(fakeConnector('fake-secret-oauth', { clientSecretEnvVar: 'FAKE_CLIENT_SECRET' }));

    await expect(oauthManager.exchangeCodeForToken('fake-secret-oauth', 'code123', 'verifier123')).rejects.toThrow(
      'FAKE_CLIENT_SECRET'
    );
  });
});

describe('OAuthManager — loopback redirect (Desktop-app OAuth clients)', () => {
  const scope = { userId: 'u1' };

  beforeEach(() => {
    process.env.FAKE_CLIENT_ID = 'test-client-id';
  });

  afterEach(() => {
    connectorRegistry.unregister('fake-loopback-oauth');
    delete process.env.FAKE_CLIENT_ID;
  });

  it('builds an authorize URL redirecting to a real 127.0.0.1 listener, not the pawos:// protocol', async () => {
    connectorRegistry.register(fakeConnector('fake-loopback-oauth', { useLoopbackRedirect: true }));

    const handle = await oauthManager.beginAuthorization('fake-loopback-oauth', scope);
    const redirectUri = new URL(handle.authorizationUrl).searchParams.get('redirect_uri');

    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2redirect$/);

    oauthManager.cancelAuthorization(handle.requestId);
    await expect(handle.result).rejects.toThrow();
  });

  it('resolves the authorization result once the loopback listener receives the redirect, with a matching redirectUri', async () => {
    connectorRegistry.register(fakeConnector('fake-loopback-oauth', { useLoopbackRedirect: true }));

    const handle = await oauthManager.beginAuthorization('fake-loopback-oauth', scope);
    const redirectUri = new URL(handle.authorizationUrl).searchParams.get('redirect_uri')!;

    const status = await simulateRedirect(redirectUri, { code: 'AUTHCODE123', state: handle.requestId });
    expect(status).toBe(200);

    const result = await handle.result;
    expect(result.code).toBe('AUTHCODE123');
    expect(result.redirectUri).toBe(redirectUri);
    expect(result.codeVerifier).toBeTruthy();
  });

  it('rejects when the loopback listener receives an error redirect', async () => {
    connectorRegistry.register(fakeConnector('fake-loopback-oauth', { useLoopbackRedirect: true }));

    const handle = await oauthManager.beginAuthorization('fake-loopback-oauth', scope);
    const redirectUri = new URL(handle.authorizationUrl).searchParams.get('redirect_uri')!;

    // Attach the rejection expectation before triggering the redirect — otherwise the HTTP
    // round trip can complete (and the promise reject) before this line has a chance to attach
    // a handler, which Node reports as an unhandled rejection even though it's caught a tick
    // later. Real callers never hit this race since they always `await handle.result`
    // immediately after `beginAuthorization` returns, with nothing async in between.
    const resultAssertion = expect(handle.result).rejects.toThrow('access_denied');
    await simulateRedirect(redirectUri, { error: 'access_denied', state: handle.requestId });
    await resultAssertion;
  });
});
