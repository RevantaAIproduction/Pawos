import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }));

const persistStoredCredential = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../ConnectionManager', () => ({ connectionManager: { persistStoredCredential } }));

import { BitbucketConnectorSDK } from './BitbucketConnectorSDK';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { connectorRegistry } from '../ConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { isConnectorEntitled } from '../ConnectorEntitlementGate';
import { entitlementService } from '../../billing/EntitlementService';

/** Bitbucket Cloud connector — fake Bitbucket API and fake pawos-web exchange endpoint, no real credentials. */

const scope = { userId: 'u-bitbucket' };
const HOUR = 60 * 60 * 1000;

interface Fake {
  validTokens: Set<string>;
  apiCalls: Array<{ url: string; method: string; auth: string; body?: unknown }>;
  refreshCalls: Array<Record<string, unknown>>;
}

function installFetch(fake: Fake) {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/connectivity/oauth/exchange')) {
        fake.refreshCalls.push(JSON.parse(String(init?.body)));
        const n = fake.refreshCalls.length + 1; // each refresh issues the next token pair
        return json(200, { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 7200 });
      }
      if (!url.startsWith('https://api.bitbucket.org/2.0')) throw new Error(`Unexpected fetch in test: ${url}`);
      const auth = ((init?.headers ?? {}) as Record<string, string>).Authorization ?? '';
      fake.apiCalls.push({ url, method: init?.method ?? 'GET', auth, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (!fake.validTokens.has(auth.replace('Bearer ', ''))) return json(401, { error: { message: 'Token expired' } });
      const path = url.replace('https://api.bitbucket.org/2.0', '');
      if (path === '/user') return json(200, { username: 'octo', display_name: 'Octo Cat' });
      if (path.startsWith('/repositories?')) {
        return json(200, { values: [{ name: 'app', full_name: 'acme/app', mainbranch: { name: 'develop' }, links: { html: { href: 'https://bitbucket.org/acme/app' } } }] });
      }
      if (path.includes('/pullrequests/7/diff')) return new Response('diff --git a/x b/x', { status: 200 });
      if (path.includes('/pullrequests/7/comments')) return json(201, { links: { html: { href: 'https://bitbucket.org/acme/app/pull-requests/7#comment-1' } } });
      if (path.includes('/pullrequests?')) {
        return json(200, {
          values: [
            { id: 7, title: 'Add login', state: 'OPEN', author: { nickname: 'ada' }, source: { branch: { name: 'feat' } }, destination: { branch: { name: 'develop' } }, links: { html: { href: 'https://bitbucket.org/acme/app/pull-requests/7' } } },
            { id: 6, title: 'Old', state: 'DECLINED', author: null, source: { branch: { name: 'old' } }, destination: { branch: { name: 'develop' } } },
          ],
        });
      }
      if (path.includes('/commits')) return json(200, { values: [{ hash: 'abc123', message: 'Fix', date: '2026-10-01T00:00:00Z', author: { raw: 'Ada <a@x>', user: { display_name: 'Ada' } } }] });
      if (path.includes('/src/')) return new Response('# Readme', { status: 200 });
      return json(404, {});
    })
  );
}

const live = () => {
  const connector = infrastructureConnectorRegistry.get('sourceControl', 'bitbucket');
  if (!connector) throw new Error('Bitbucket connector is not registered.');
  return connector;
};

describe('BitbucketConnectorSDK', () => {
  let sdk: BitbucketConnectorSDK;
  let fake: Fake;

  beforeEach(async () => {
    persistStoredCredential.mockClear();
    await credentialVaultBridge.revoke('bitbucket', scope);
    sdk = new BitbucketConnectorSDK();
    connectorRegistry.register(sdk);
    fake = { validTokens: new Set(['access-1']), apiCalls: [], refreshCalls: [] };
    installFetch(fake);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    connectorRegistry.unregister('bitbucket');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares the Bitbucket Cloud OAuth 2.0 endpoints and the hosted callback env var', () => {
    expect(sdk.definition.oauth).toMatchObject({
      authorizationUrl: 'https://bitbucket.org/site/oauth2/authorize',
      tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
      clientIdEnvVar: 'CONNECTOR_BITBUCKET_CLIENT_ID',
      redirectUriEnvVar: 'CONNECTOR_BITBUCKET_CALLBACK_URL',
    });
    expect(sdk.definition.category).toBe('sourceControl');
  });

  it('connect() exchanges the code through OAuthManager and keeps access token, refresh token and expiry in the vault', async () => {
    const expiresAt = Date.now() + 2 * HOUR;
    vi.spyOn(oauthManager, 'beginAuthorization').mockResolvedValue({
      requestId: 'r',
      authorizationUrl: 'https://bitbucket.org/site/oauth2/authorize',
      result: Promise.resolve({ code: 'code', redirectUri: 'https://pawos.revantaai.com/api/connectors/bitbucket/oauth/callback' }),
    });
    const exchangeSpy = vi.spyOn(oauthManager, 'exchangeCodeForToken').mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt, grantedScopes: ['account', 'repository'] });

    const connection = await sdk.connect(scope);

    expect(exchangeSpy).toHaveBeenCalledWith('bitbucket', 'code', undefined, 'https://pawos.revantaai.com/api/connectors/bitbucket/oauth/callback');
    expect(connection).toMatchObject({ connectorId: 'bitbucket', status: 'connected', metadata: { accountName: 'Octo Cat', username: 'octo' } });
    expect(await credentialVaultBridge.read('bitbucket', scope)).toMatchObject({ secret: 'access-1', refreshToken: 'refresh-1', expiresAt, authMethod: 'oauth2' });
  });

  it('activates from tokens alone — the shape a connection made on PawOS Web is restored with', async () => {
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + HOUR });
    await sdk.refresh(scope);

    expect(await sdk.getStatus(scope)).toMatchObject({ state: 'connected', detail: 'Octo Cat' });
    expect(live().isConfigured()).toBe(true);
    expect(fake.refreshCalls).toHaveLength(0);
  });

  it('refreshes an expired token on restore and persists the rotated credential', async () => {
    fake.validTokens = new Set(['access-2']);
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });
    await sdk.refresh(scope);

    expect(fake.refreshCalls).toEqual([{ connectorId: 'bitbucket', grant_type: 'refresh_token', refresh_token: 'refresh-1' }]);
    expect(await credentialVaultBridge.read('bitbucket', scope)).toMatchObject({ secret: 'access-2', refreshToken: 'refresh-2' });
    expect(persistStoredCredential).toHaveBeenCalledWith('bitbucket', scope);
    expect((await sdk.getStatus(scope)).state).toBe('connected');
  });

  it('an API call with an expiring token refreshes first; a 401 triggers one refresh and one retry', async () => {
    fake.validTokens = new Set(['access-2']);
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + 60_000 });
    expect((await live().listRepositories()).ok).toBe(true);
    expect(fake.apiCalls.map((c) => c.auth)).toEqual(['Bearer access-2']);

    fake.apiCalls = [];
    fake.validTokens = new Set(['access-3']);
    // access-2 has two hours left on paper, but Bitbucket now rejects it.
    const result = await live().listRepositories();
    expect(fake.apiCalls.map((c) => c.auth)).toEqual(['Bearer access-2', 'Bearer access-3']);
    expect(result.ok).toBe(true);
    expect(fake.refreshCalls).toHaveLength(2);
    expect(fake.refreshCalls[1]).toMatchObject({ refresh_token: 'refresh-2' }); // the rotated refresh token is the one presented
  });

  it('maps repositories, commits, pull requests, files, diffs and review comments from the Bitbucket API', async () => {
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + HOUR });
    const connector = live();

    expect(await connector.listRepositories()).toEqual({ ok: true, repos: [{ name: 'app', fullName: 'acme/app', defaultBranch: 'develop', url: 'https://bitbucket.org/acme/app' }] });
    expect(await connector.getLatestCommit('acme/app', 'develop')).toEqual({ ok: true, sha: 'abc123', message: 'Fix', author: 'Ada', date: '2026-10-01T00:00:00Z' });
    expect(await connector.getFileContent('acme/app', 'docs/READ ME.md')).toEqual({ ok: true, content: '# Readme' });
    expect(await connector.getPullRequestDiff('acme/app', 7)).toEqual({ ok: true, diff: 'diff --git a/x b/x' });
    expect(await connector.listPullRequests('acme/app')).toEqual({
      ok: true,
      pullRequests: [
        { number: 7, title: 'Add login', author: 'ada', headBranch: 'feat', baseBranch: 'develop', url: 'https://bitbucket.org/acme/app/pull-requests/7', state: 'open' },
        { number: 6, title: 'Old', author: 'unknown', headBranch: 'old', baseBranch: 'develop', url: 'https://bitbucket.org/acme/app/pull-requests/6', state: 'closed' },
      ],
    });
    expect(await connector.createPullRequestComment('acme/app', 7, 'Looks good')).toEqual({ ok: true, commentUrl: 'https://bitbucket.org/acme/app/pull-requests/7#comment-1' });

    const comment = fake.apiCalls.at(-1)!;
    expect(comment).toMatchObject({ method: 'POST', url: 'https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests/7/comments', body: { content: { raw: 'Looks good' } } });
    expect(fake.apiCalls.find((c) => c.url.includes('/src/'))?.url).toBe('https://api.bitbucket.org/2.0/repositories/acme/app/src/HEAD/docs/READ%20ME.md');
  });

  it('disconnect clears the vault and leaves no configured Bitbucket connector', async () => {
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + HOUR });
    await sdk.disconnect(scope);

    expect(await credentialVaultBridge.read('bitbucket', scope)).toBeUndefined();
    expect(live().isConfigured()).toBe(false);
    expect((await live().listRepositories()).ok).toBe(false);
  });

  it('is gated by the connectBitbucket feature: Pro and above, not Go', () => {
    const feature = vi.spyOn(entitlementService, 'isFeatureAvailable');
    feature.mockReturnValue(false);
    expect(isConnectorEntitled('bitbucket')).toBe(false);
    feature.mockReturnValue(true);
    expect(isConnectorEntitled('bitbucket')).toBe(true);
    expect(feature).toHaveBeenCalledWith('connectBitbucket');
  });
});
