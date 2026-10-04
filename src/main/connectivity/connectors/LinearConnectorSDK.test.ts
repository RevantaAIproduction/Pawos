import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }));

const persistStoredCredential = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../ConnectionManager', () => ({ connectionManager: { persistStoredCredential } }));

import { LinearConnectorSDK } from './LinearConnectorSDK';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { connectorRegistry } from '../ConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';

/**
 * Linear OAuth token lifecycle. No real credentials and no real network: `fetch` is a fake that
 * plays Linear's GraphQL API and pawos-web's token-exchange endpoint (the only place a refresh
 * ever goes — see OAuthManager.exchangeViaBackend).
 */

const scope = { userId: 'u-linear-lifecycle' };
const HOUR = 60 * 60 * 1000;
const ISSUE = {
  identifier: 'ENG-7',
  title: 'Fix login',
  description: 'Steps…',
  url: 'https://linear.app/acme/issue/ENG-7',
  state: { name: 'In Progress' },
  labels: { nodes: [{ name: 'bug' }] },
  priorityLabel: 'High',
  dueDate: '2026-11-01',
  assignee: { name: 'Ada' },
  creator: { name: 'Grace' },
};

interface FakeBackend {
  /** Access tokens Linear's GraphQL API currently accepts. */
  validTokens: Set<string>;
  /** What the token endpoint answers to a refresh; a function sees the refresh token presented. */
  refresh: (refreshToken: string) => { status: number; body: Record<string, unknown> } | 'network-error';
  graphqlAuth: string[];
  refreshCalls: Array<Record<string, unknown>>;
}

function installFetch(backend: FakeBackend) {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (url === 'https://api.linear.app/graphql') {
      const token = (headers.Authorization ?? '').replace(/^Bearer /, '');
      backend.graphqlAuth.push(token);
      if (!backend.validTokens.has(token)) return json(401, { errors: [{ message: 'Authentication required' }] });
      const query = String(JSON.parse(String(init?.body)).query);
      if (query.includes('issueSearch')) return json(200, { data: { issueSearch: { nodes: [ISSUE] } } });
      if (query.includes('assignedIssues')) return json(200, { data: { viewer: { assignedIssues: { nodes: [ISSUE] } } } });
      if (query.includes('issue(id')) return json(200, { data: { issue: ISSUE } });
      return json(200, { data: { viewer: { name: 'Ada' }, organization: { name: 'Acme' } } });
    }
    if (url.endsWith('/api/connectivity/oauth/exchange')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      backend.refreshCalls.push(body);
      const answer = backend.refresh(String(body.refresh_token));
      if (answer === 'network-error') throw new TypeError('fetch failed');
      return json(answer.status, answer.body);
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function liveConnector() {
  const connector = infrastructureConnectorRegistry.get('projectManagement', 'linear');
  if (!connector) throw new Error('Linear connector is not registered.');
  return connector;
}

describe('LinearConnectorSDK — OAuth token lifecycle', () => {
  let sdk: LinearConnectorSDK;
  let backend: FakeBackend;
  let logged: string;

  beforeEach(async () => {
    process.env.LINEAR_MCP_DISABLED = '1'; // GraphQL only here; MCP has its own tests
    persistStoredCredential.mockClear();
    await credentialVaultBridge.revoke('linear', scope);
    sdk = new LinearConnectorSDK();
    connectorRegistry.register(sdk);
    backend = {
      validTokens: new Set(['access-1']),
      refresh: () => ({ status: 200, body: { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 86400 } }),
      graphqlAuth: [],
      refreshCalls: [],
    };
    installFetch(backend);
    logged = '';
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged += args.map(String).join(' ');
      });
    }
  });

  afterEach(() => {
    connectorRegistry.unregister('linear');
    delete process.env.LINEAR_MCP_DISABLED;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connect() keeps the access token, refresh token, expiry and granted scopes in the Credential Vault', async () => {
    const expiresAt = Date.now() + 24 * HOUR;
    vi.spyOn(oauthManager, 'beginAuthorization').mockResolvedValue({
      requestId: 'r',
      authorizationUrl: 'https://linear.app/oauth/authorize',
      result: Promise.resolve({ code: 'code', redirectUri: 'https://pawos.test/cb' }),
    });
    vi.spyOn(oauthManager, 'exchangeCodeForToken').mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt,
      grantedScopes: ['read', 'write'],
    });

    const connection = await sdk.connect(scope);

    expect(connection.status).toBe('connected');
    expect(await credentialVaultBridge.read('linear', scope)).toMatchObject({
      secret: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt,
      grantedScopes: ['read', 'write'],
      authMethod: 'oauth2',
    });
    expect((await sdk.getStatus(scope)).state).toBe('connected');
  });

  it('restore after an app restart re-seeds the vault and does not refresh a token that is still valid', async () => {
    const expiresAt = Date.now() + 10 * HOUR;
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt });
    await sdk.refresh(scope);

    expect(await credentialVaultBridge.read('linear', scope)).toMatchObject({ secret: 'access-1', refreshToken: 'refresh-1', expiresAt });
    expect(backend.refreshCalls).toHaveLength(0);
    expect((await sdk.getStatus(scope)).state).toBe('connected');
  });

  it('an expired access token is refreshed on restore, and the rotated credential is stored and persisted', async () => {
    backend.validTokens = new Set(['access-2']);
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });
    await sdk.refresh(scope);

    expect(backend.refreshCalls).toEqual([{ connectorId: 'linear', grant_type: 'refresh_token', refresh_token: 'refresh-1' }]);
    const stored = await credentialVaultBridge.read('linear', scope);
    expect(stored).toMatchObject({ secret: 'access-2', refreshToken: 'refresh-2' });
    expect(stored?.expiresAt).toBeGreaterThan(Date.now() + 23 * HOUR);
    expect(persistStoredCredential).toHaveBeenCalledWith('linear', scope);
    expect((await sdk.getStatus(scope)).state).toBe('connected');
    expect(await sdk.getFreshAccessToken()).toBe('access-2');
  });

  it('keeps the existing refresh token when Linear does not rotate it', async () => {
    backend.refresh = () => ({ status: 200, body: { access_token: 'access-2', expires_in: 86400 } });
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });
    await sdk.refresh(scope);

    expect(await credentialVaultBridge.read('linear', scope)).toMatchObject({ secret: 'access-2', refreshToken: 'refresh-1' });
  });

  it('a rejected refresh token leaves the connection asking for re-authorisation, with nothing persisted', async () => {
    backend.refresh = () => ({ status: 400, body: { error: 'invalid_grant' } });
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });
    await sdk.refresh(scope);

    const status = await sdk.getStatus(scope);
    expect(status.state).toBe('requiresReauth');
    expect(status.lastError).toBe('invalid_grant');
    expect(await credentialVaultBridge.read('linear', scope)).toMatchObject({ secret: 'access-1', refreshToken: 'refresh-1' });
    expect(persistStoredCredential).not.toHaveBeenCalled();
  });

  it('a network failure during refresh is reported as expired, not as a revoked grant', async () => {
    backend.refresh = () => 'network-error';
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });
    await sdk.refresh(scope);

    expect((await sdk.getStatus(scope)).state).toBe('expired');
  });

  it('a credential with no refresh token that Linear rejects asks for a reconnect without calling the token endpoint', async () => {
    backend.validTokens = new Set();
    await sdk.authenticate(scope, { accessToken: 'legacy-token' });
    await sdk.refresh(scope);

    expect((await sdk.getStatus(scope)).state).toBe('requiresReauth');
    expect(backend.refreshCalls).toHaveLength(0);
  });

  it('a GraphQL read refreshes an expiring token first and sends the new one', async () => {
    backend.validTokens = new Set(['access-2']);
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + 60_000 });

    const result = await liveConnector().listMyTickets();

    expect(result.ok).toBe(true);
    expect(backend.refreshCalls).toHaveLength(1);
    expect(backend.graphqlAuth).toEqual(['access-2']);
  });

  it('a 401 from Linear on a token with no known expiry triggers one refresh and one retry', async () => {
    backend.validTokens = new Set(['access-2']);
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1' });

    const result = await liveConnector().getTicket('ENG-7');

    expect(result.ok).toBe(true);
    expect(backend.graphqlAuth).toEqual(['access-1', 'access-2']);
    expect(backend.refreshCalls).toHaveLength(1);
  });

  it('overlapping reads share a single refresh, so a rotated refresh token is never presented twice', async () => {
    backend.validTokens = new Set(['access-2']);
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });

    const results = await Promise.all([liveConnector().listMyTickets(), liveConnector().searchTickets('login'), sdk.getFreshAccessToken()]);

    expect(results[0].ok && results[1].ok).toBe(true);
    expect(backend.refreshCalls).toHaveLength(1);
  });

  it('existing GraphQL operations keep working and keep their ticket mapping', async () => {
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + 10 * HOUR });
    const connector = liveConnector();
    const expected = {
      id: 'ENG-7',
      title: 'Fix login',
      description: 'Steps…',
      url: 'https://linear.app/acme/issue/ENG-7',
      status: 'In Progress',
      labels: ['bug'],
      priority: 'High',
      dueDate: '2026-11-01',
      assignee: 'Ada',
      reporter: 'Grace',
    };

    expect(await sdk.validate(scope)).toEqual({ valid: true });
    expect(await sdk.health(scope)).toMatchObject({ status: 'healthy' });
    expect(await connector.getTicket('ENG-7')).toEqual({ ok: true, ticket: expected });
    expect(await connector.searchTickets('login')).toEqual({ ok: true, tickets: [expected] });
    expect(await connector.listMyTickets()).toEqual({ ok: true, tickets: [expected] });
    expect(backend.refreshCalls).toHaveLength(0);
  });

  it('disconnect clears the vault and leaves no configured Linear connector', async () => {
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + HOUR });
    await sdk.disconnect(scope);

    expect(await credentialVaultBridge.read('linear', scope)).toBeUndefined();
    expect(liveConnector().isConfigured()).toBe(false);
    expect(await sdk.getFreshAccessToken()).toBeUndefined();
  });

  it('never writes an access or refresh token to the console', async () => {
    backend.refresh = () => ({ status: 400, body: { error: 'invalid_grant' } });
    await sdk.authenticate(scope, { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() - HOUR });
    await sdk.refresh(scope);
    backend.refresh = () => ({ status: 200, body: { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 86400 } });
    await sdk.getFreshAccessToken({ forceRefresh: true });

    for (const secret of ['access-1', 'access-2', 'refresh-1', 'refresh-2']) expect(logged).not.toContain(secret);
  });
});
