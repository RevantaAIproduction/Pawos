import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorStatus } from '../../shared/connectivity/ConnectivityTypes';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn), removeHandler: vi.fn() },
}));

// The real AccountSession class — only the Supabase call behind it is replaced, so sign-in,
// sign-out, switching accounts and in-flight verification are the app's own logic.
type Verdict = { userId: string } | { userId: null; networkError: boolean };
const verifier = vi.hoisted(() => ({ answer: async (_token: string): Promise<Verdict> => ({ userId: null, networkError: false }) }));
vi.mock('../auth/AccountSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/AccountSession')>();
  return { ...actual, accountSession: new actual.AccountSession((token) => verifier.answer(token)) };
});

import { accountSession } from '../auth/AccountSession';
import { credentialVaultBridge } from './CredentialVaultBridge';
import { connectorRegistry } from './ConnectorRegistry';
import { connectionManager } from './ConnectionManager';
import { jiraMetadataStore } from './JiraMetadataStore';
import { forgetConnectivityState } from './accountBoundary';
import { mcpCredentialId } from '../../shared/connectivity/McpProviders';
import { AccountBound, StaleAccountOperationError, bindToAccountEpoch, isStaleAccountOperation } from './accountEpoch';
import { oauthManager } from './OAuthManager';
import { connectorMcpGateway } from './mcp/ConnectorMcpGateway';
import { entitlementService } from '../billing/EntitlementService';
import { registerConnectivityIpc } from '../ipc/connectivityIpc';
import { infrastructureConnectorRegistry } from '../infrastructure/InfrastructureConnectorRegistry';
import { officeConnectorRegistry } from '../office/OfficeConnectorRegistry';
import { bitbucketConnectorSDK } from './connectors/BitbucketConnectorSDK';
import { gitHubConnectorSDK } from './connectors/GitHubConnectorSDK';
import { gitLabConnectorSDK } from './connectors/GitLabConnectorSDK';
import { googleWorkspaceConnectorSDK } from './connectors/GoogleWorkspaceConnectorSDK';
import { jiraConnectorSDK } from './connectors/JiraConnectorSDK';
import { linearConnectorSDK } from './connectors/LinearConnectorSDK';
import { microsoftConnectorSDK } from './connectors/MicrosoftConnectorSDK';
import { netlifyConnectorSDK } from './connectors/NetlifyConnectorSDK';
import { railwayConnectorSDK } from './connectors/RailwayConnectorSDK';
import { slackConnectorSDK } from './connectors/SlackConnectorSDK';
import { vercelConnectorSDK } from './connectors/VercelConnectorSDK';

/**
 * Connector credentials never cross accounts: the vault, the IPC channels, each connector's own
 * in-memory token and the live connections all belong to the account the main process verified —
 * never to a user id a renderer put in a scope — and are forgotten when that account changes.
 */

const A = 'user-a';
const B = 'user-b';
const scopeOf = (userId: string): ConnectivityScope => ({ userId });
const tokenFor = (sub: string) =>
  `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;
const fakeEvent = { sender: { isDestroyed: () => true } } as any;
const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!(fakeEvent, ...args);
const callNoEvent = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);

async function signIn(userId: string) {
  verifier.answer = async (token) => (token === tokenFor(userId) ? { userId } : { userId: null, networkError: false });
  await accountSession.update(tokenFor(userId));
  expect(accountSession.verifiedUserId).toBe(userId);
}

const DISCONNECTED: ConnectorStatus = { state: 'disconnected', capabilities: [] };

/**
 * A connector built like the real ones: its token and status are account-bound and every method
 * runs as an operation of the account signed in when it was called (connectivity/accountEpoch.ts).
 * connect()/authenticate() can be held open; forgetLocalSession() calls are recorded.
 */
class FakeConnector implements ConnectorSDK {
  readonly definition: ConnectorSDK['definition'];
  readonly forget = vi.fn();
  readonly started: Promise<void>;
  private markStarted: () => void = () => {};
  /** Operations being held open, most recent last: release() lets the most recent one continue. */
  private readonly held: (() => void)[] = [];
  private readonly token = new AccountBound<string | undefined>(undefined, 'refuse', 'a fake token');
  private readonly status = new AccountBound<ConnectorStatus>(DISCONNECTED, 'ignore', 'a fake status');
  private readonly binding = bindToAccountEpoch(this);

  constructor(id: string, private readonly opts: { storesInVault?: boolean; vaultFirst?: boolean }) {
    this.definition = { id, displayName: id, category: 'other', authMethod: 'oauth2', capabilities: ['read'] };
    this.started = new Promise<void>((resolve) => (this.markStarted = resolve));
  }

  private async hold(): Promise<void> {
    const held = new Promise<void>((resolve) => this.held.push(resolve));
    this.markStarted();
    await held;
  }

  release(): void {
    this.held.pop()?.();
  }

  /** The token this connector would use right now. */
  currentToken(): string | undefined {
    return this.token.get();
  }

  async connect(scope: ConnectivityScope) {
    await this.hold();
    // An integration that stores before it sets its own token: the vault refuses the stale write.
    if (this.opts.vaultFirst) await credentialVaultBridge.store(this.definition.id, scope, `token-for-${scope.userId}`, 'oauth2');
    // Like every real connector: the token is set on the connector first, then stored.
    this.token.set(`token-for-${scope.userId}`);
    this.status.set({ state: 'connected', capabilities: ['read'] });
    if (this.opts.storesInVault !== false) await credentialVaultBridge.store(this.definition.id, scope, `token-for-${scope.userId}`, 'oauth2');
    return { id: `${this.definition.id}:${scope.userId}`, connectorId: this.definition.id, scope, status: 'connected', capabilities: ['read'], connectedAt: new Date().toISOString() } as never;
  }

  async disconnect() {
    this.token.set(undefined);
    this.status.set(DISCONNECTED);
  }

  forgetLocalSession(): void {
    this.forget();
    if (isStaleAccountOperation()) return;
    this.token.set(undefined);
    this.status.set(DISCONNECTED);
  }

  async authenticate(scope: ConnectivityScope, credential: unknown) {
    // Like most real connectors: restore only sets the token on the connector (no vault write).
    await this.hold();
    this.token.set((credential as { accessToken?: string } | undefined)?.accessToken ?? `restored-for-${scope.userId}`);
    this.status.set({ state: 'connected', capabilities: ['read'] });
  }

  async refresh() {}
  async validate() {
    return { valid: true };
  }
  async health() {
    return { status: 'healthy' as const };
  }
  async getStatus() {
    return this.status.get();
  }
  capabilities() {
    return this.status.get().capabilities;
  }
  subscribe() {
    return () => {};
  }
  unsubscribe() {}
  async execute() {
    return undefined;
  }
}

function fakeConnector(id: string, opts: { storesInVault?: boolean; vaultFirst?: boolean } = {}) {
  const sdk = new FakeConnector(id, opts);
  return { sdk, forget: sdk.forget, started: sdk.started, release: () => sdk.release() };
}

beforeAll(() => registerConnectivityIpc());
beforeEach(async () => {
  verifier.answer = async () => ({ userId: null, networkError: false });
  await accountSession.update(null);
  forgetConnectivityState();
  vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  connectorRegistry.unregister('github');
});

describe('the vault belongs to the signed-in account', () => {
  it('the same account stores, reads, rotates and reads back its latest credential', async () => {
    await signIn(A);
    await credentialVaultBridge.store('github', scopeOf(A), 'a-1', 'oauth2', { refreshToken: 'r-1' });
    await credentialVaultBridge.rotate('github', scopeOf(A), 'a-2');
    expect(await credentialVaultBridge.read('github', scopeOf(A))).toMatchObject({ secret: 'a-2', refreshToken: 'r-1' });
    expect((await credentialVaultBridge.readLatest('github'))?.secret).toBe('a-2');
  });

  it("account A's credential is never readable while B is signed in — by scope or by readLatest", async () => {
    await signIn(A);
    await credentialVaultBridge.store('github', scopeOf(A), 'a-token', 'oauth2');
    await signIn(B);
    expect(await credentialVaultBridge.read('github', scopeOf(A))).toBeUndefined();
    expect(await credentialVaultBridge.readLatest('github')).toBeUndefined();
    await credentialVaultBridge.store('github', scopeOf(B), 'b-token', 'oauth2');
    expect((await credentialVaultBridge.readLatest('github'))?.secret).toBe('b-token');
    expect(await credentialVaultBridge.read('github', scopeOf(A))).toBeUndefined();
  });

  it("even if A's entry were still cached while B is verified, it is never returned (read guard on its own)", async () => {
    await signIn(A);
    await credentialVaultBridge.store('github', scopeOf(A), 'a-token', 'oauth2');
    vi.spyOn(accountSession, 'verifiedUserId', 'get').mockReturnValue(B); // no account-change event: nothing cleared
    expect(await credentialVaultBridge.read('github', scopeOf(A))).toBeUndefined();
    expect(await credentialVaultBridge.readLatest('github')).toBeUndefined();
  });

  it('signed out: nothing is stored or returned', async () => {
    await expect(credentialVaultBridge.store('github', scopeOf(A), 'x', 'oauth2')).rejects.toThrow(/isn't for the account signed in/);
    expect(await credentialVaultBridge.read('github', scopeOf(A))).toBeUndefined();
    expect(await credentialVaultBridge.readLatest('github')).toBeUndefined();
  });
});

describe('IPC: a user id in a scope is never authorization', () => {
  it("B signed in cannot get A's credential by naming A; B gets its own", async () => {
    await signIn(B);
    await credentialVaultBridge.store('slack', scopeOf(B), 'b-slack', 'oauth2');
    const forged = await callNoEvent('connectivity:getStoredCredential', 'slack', scopeOf(A));
    expect(forged).toMatchObject({ ok: false, error: expect.stringMatching(/isn't the account signed in/) });
    const own = await callNoEvent('connectivity:getStoredCredential', 'slack', scopeOf(B));
    expect(own).toMatchObject({ ok: true, data: { secret: 'b-slack' } });
  });

  it('every scoped channel refuses a forged user id, before doing anything', async () => {
    await signIn(B);
    const { sdk } = fakeConnector('github');
    connectorRegistry.register(sdk);
    for (const [channel, args, needsEvent] of [
      ['connectivity:listConnections', [scopeOf(A)], false],
      ['connectivity:connect', ['github', scopeOf(A)], true],
      ['connectivity:getStatus', ['github', scopeOf(A)], false],
      ['connectivity:restore', ['github', scopeOf(A), { accessToken: 'x' }], true],
      ['connectivity:apiTokens:save', ['github', scopeOf(A), 'tok'], false],
      ['connectivity:oauth:begin', ['github', scopeOf(A)], false],
      ['connectivity:getJiraMetadata', [scopeOf(A)], false],
      ['connectivity:slack:postMessage', [{ scope: scopeOf(A), channel: 'c', text: 't' }], false],
      ['connectivity:deploymentProfiles:list', [scopeOf(A)], false],
    ] as const) {
      const result = needsEvent ? await call(channel, ...args) : await callNoEvent(channel, ...args);
      expect(result, channel).toMatchObject({ ok: false, error: expect.stringMatching(/isn't the account signed in/) });
    }
    expect(await sdk.getStatus(scopeOf(A))).toMatchObject({ state: 'disconnected' });
  });

  it('a missing or malformed user id is refused; signed out, every scope is refused', async () => {
    await signIn(B);
    for (const scope of [null, {}, { userId: '' }, { userId: 42 }]) {
      expect(await callNoEvent('connectivity:getStoredCredential', 'slack', scope)).toMatchObject({ ok: false, error: expect.stringMatching(/valid scope/) });
    }
    await accountSession.update(null);
    expect(await callNoEvent('connectivity:getStoredCredential', 'slack', scopeOf(B))).toMatchObject({ ok: false, error: expect.stringMatching(/isn't the account signed in/) });
  });

  it('a connection restored right after sign-in waits for the session being verified, then succeeds', async () => {
    let finish!: (verdict: Verdict) => void;
    verifier.answer = () => new Promise<Verdict>((resolve) => (finish = resolve));
    const { sdk, started, release } = fakeConnector('github');
    connectorRegistry.register(sdk);
    const verifying = accountSession.update(tokenFor(A)); // the renderer has just sent its session
    const restoring = call('connectivity:restore', 'github', scopeOf(A), { accessToken: 'restored' });
    finish({ userId: A });
    await verifying;
    await started;
    release();
    expect(await restoring).toMatchObject({ ok: true, data: { state: 'connected' } });
  });

  it('…and is refused when that session turns out to be someone else', async () => {
    let finish!: (verdict: Verdict) => void;
    verifier.answer = () => new Promise<Verdict>((resolve) => (finish = resolve));
    const { sdk } = fakeConnector('github');
    connectorRegistry.register(sdk);
    const verifying = accountSession.update(tokenFor(B));
    const restoring = call('connectivity:restore', 'github', scopeOf(A), { accessToken: 'restored' });
    finish({ userId: B });
    await verifying;
    expect(await restoring).toMatchObject({ ok: false, error: expect.stringMatching(/isn't the account signed in/) });
  });
});

describe('an account change forgets everything held in memory', () => {
  for (const [name, next] of [
    ['sign-out', async () => accountSession.update(null)],
    ['switching to another account', async () => signIn(B)],
  ] as const) {
    it(`${name}: the connector's token, the connection, Jira metadata and cached credentials are gone`, async () => {
      await signIn(A);
      const { sdk, forget, started, release } = fakeConnector('github');
      connectorRegistry.register(sdk);
      const connecting = call('connectivity:connect', 'github', scopeOf(A));
      await started;
      release();
      expect(await connecting).toMatchObject({ ok: true });
      await jiraMetadataStore.store(scopeOf(A), { cloudId: 'c', siteUrl: 'https://a.example' } as never);
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(1);

      await next();

      expect(forget).toHaveBeenCalled();
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
      expect(await jiraMetadataStore.read(scopeOf(A))).toBeUndefined();
      await signIn(A); // even back as A, nothing was kept in memory — A restores from its stored copy
      expect(await credentialVaultBridge.read('github', scopeOf(A))).toBeUndefined();
    });
  }
});

describe('in-flight operations racing an account change', () => {
  it('a connect started by A that finishes after B signs in is refused: nothing stored, kept or active', async () => {
    await signIn(A);
    const { sdk, started, release } = fakeConnector('github');
    connectorRegistry.register(sdk);
    const connecting = call('connectivity:connect', 'github', scopeOf(A));
    await started; // A's connect is genuinely in flight
    await signIn(B);
    release();
    expect(await connecting).toMatchObject({ ok: false, error: expect.stringMatching(/account changed/) });
    expect(sdk.currentToken()).toBeUndefined();
    expect(await sdk.getStatus()).toMatchObject({ state: 'disconnected' });
    expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
    expect(await connectionManager.listConnections(scopeOf(B))).toHaveLength(0);
    expect(await credentialVaultBridge.readLatest('github')).toBeUndefined();
  });

  for (const [operation, channel] of [
    ['connect', 'connectivity:connect'],
    ['restore', 'connectivity:restore'],
  ] as const) {
    it(`a ${operation} for A finishing after B restored the same integration never replaces B's session`, async () => {
      await signIn(A);
      const { sdk, started, release } = fakeConnector('github', { storesInVault: false });
      connectorRegistry.register(sdk);
      const running = call(channel, 'github', scopeOf(A), ...(operation === 'restore' ? [{ accessToken: 'a-token' }] : []));
      await started;
      await signIn(B);
      // B restores the same integration while A's operation is still running.
      const bRestore = sdk.authenticate(scopeOf(B), { accessToken: 'b-token' });
      await vi.waitFor(() => expect((sdk as unknown as { held: unknown[] }).held).toHaveLength(2));
      release(); // B's restore finishes first…
      await bRestore;
      expect(sdk.currentToken()).toBe('b-token');
      release(); // …then A's late operation
      expect(await running).toMatchObject({ ok: false, error: expect.stringMatching(/account changed/) });
      expect(sdk.currentToken()).toBe('b-token');
      expect(await sdk.getStatus()).toMatchObject({ state: 'connected' });
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
    });
  }

  it("a late operation's refused vault write never makes the integration forget B's session", async () => {
    await signIn(A);
    const { sdk, forget, started, release } = fakeConnector('github', { vaultFirst: true });
    connectorRegistry.register(sdk);
    const running = call('connectivity:connect', 'github', scopeOf(A));
    await started;
    await signIn(B);
    const bRestore = sdk.authenticate(scopeOf(B), { accessToken: 'b-token' });
    await vi.waitFor(() => expect((sdk as unknown as { held: unknown[] }).held).toHaveLength(2));
    release();
    await bRestore;
    forget.mockClear();
    const mcpReset = vi.spyOn(connectorMcpGateway, 'reset');
    release(); // A's connect: its vault write for A is refused while B is signed in
    expect(await running).toMatchObject({ ok: false });
    expect(mcpReset).not.toHaveBeenCalled(); // B's MCP session for the integration is left alone
    expect(sdk.currentToken()).toBe('b-token');
    expect(await sdk.getStatus()).toMatchObject({ state: 'connected' });
    // forget may be asked from the stale operation, but an account-bound connector ignores it there
    expect(sdk.currentToken()).toBe('b-token');
  });

  it('a request for A still being checked when B signs in is refused before the connector runs', async () => {
    await signIn(A);
    const { sdk } = fakeConnector('github');
    const connectSpy = vi.spyOn(sdk, 'connect');
    connectorRegistry.register(sdk);
    const connecting = call('connectivity:connect', 'github', scopeOf(A));
    await signIn(B);
    expect(await connecting).toMatchObject({ ok: false, error: expect.stringMatching(/isn't the account signed in/) });
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('a write for an account that is not signed in (outside any operation) is refused, and that connector forgets', async () => {
    await signIn(A);
    const { sdk, forget } = fakeConnector('github');
    connectorRegistry.register(sdk);
    await credentialVaultBridge.store('github', scopeOf(A), 'a-1', 'oauth2');
    await accountSession.update(null);
    forget.mockClear();
    await expect(credentialVaultBridge.rotate('github', scopeOf(A), 'a-2')).rejects.toThrow(/isn't for the account signed in/);
    expect(forget).toHaveBeenCalledTimes(1);
  });
});

describe('real integrations: a late operation for A never publishes into B’s session', () => {
  const gitHubLive = () => infrastructureConnectorRegistry.listConfigured('sourceControl').some((c) => c.id === 'github');
  const linearLive = () => infrastructureConnectorRegistry.listConfigured('projectManagement').some((c) => c.id === 'linear');
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const linearIdentity = (org: string) => json({ data: { viewer: { name: org }, organization: { name: org } } });

  afterEach(() => {
    vi.unstubAllGlobals();
    gitHubConnectorSDK.forgetLocalSession();
    linearConnectorSDK.forgetLocalSession();
    connectorRegistry.unregister('linear');
  });

  it('GitHub: a delayed connect for A, after B restored GitHub, is discarded — B stays connected as B', async () => {
    await signIn(A);
    let finishAuthorization!: (value: { code: string; codeVerifier: string; redirectUri: string }) => void;
    vi.spyOn(oauthManager, 'beginAuthorization').mockResolvedValue({
      requestId: 'r',
      authorizationUrl: 'https://example.invalid',
      result: new Promise((resolve) => (finishAuthorization = resolve)),
    } as never);
    vi.spyOn(oauthManager, 'exchangeCodeForToken').mockResolvedValue({ accessToken: 'a-github', grantedScopes: [] } as never);
    vi.stubGlobal('fetch', vi.fn(async () => json({ login: 'a-user' })));

    const connecting = gitHubConnectorSDK.connect(scopeOf(A));
    await signIn(B);
    await gitHubConnectorSDK.authenticate(scopeOf(B), { accessToken: 'b-github', login: 'b-user' });
    finishAuthorization({ code: 'c', codeVerifier: 'v', redirectUri: 'x' });

    await expect(connecting).rejects.toBeInstanceOf(StaleAccountOperationError);
    expect(await gitHubConnectorSDK.getStatus(scopeOf(B))).toMatchObject({ state: 'connected', detail: 'b-user' });
    expect(gitHubLive()).toBe(true);
    expect(await credentialVaultBridge.readLatest('github')).toBeUndefined(); // A's token was never stored
  });

  it('Linear: a delayed refresh for A, after B restored Linear, never merges into B’s credential — and hands A nothing', async () => {
    await signIn(A);
    let finishRefresh!: (value: { accessToken: string; refreshToken?: string; expiresAt?: number }) => void;
    vi.spyOn(oauthManager, 'refreshAndPersist').mockImplementation(() => new Promise((resolve) => (finishRefresh = resolve)));
    vi.stubGlobal('fetch', vi.fn(async () => linearIdentity('b-org')));
    await linearConnectorSDK.authenticate(scopeOf(A), { accessToken: 'a-linear', refreshToken: 'a-refresh', expiresAt: Date.now() - 1000 });
    const aWantsFreshToken = linearConnectorSDK.getFreshAccessToken(); // refresh for A starts and waits on the provider

    await signIn(B);
    await linearConnectorSDK.authenticate(scopeOf(B), { accessToken: 'b-linear', refreshToken: 'b-refresh', expiresAt: Date.now() + 3_600_000, organizationName: 'b-org' });
    finishRefresh({ accessToken: 'a-linear-refreshed', refreshToken: 'a-refresh-2', expiresAt: Date.now() + 3_600_000 });

    expect(await aWantsFreshToken).toBeUndefined(); // never B's token, never A's refreshed one
    expect(await linearConnectorSDK.getFreshAccessToken()).toBe('b-linear');
    expect(await linearConnectorSDK.getStatus(scopeOf(B))).toMatchObject({ state: 'connected', detail: 'b-org' });
    expect(linearLive()).toBe(true);
    expect((await credentialVaultBridge.read('linear', scopeOf(B)))?.secret).toBe('b-linear');
  });

  it('Linear: a delayed restore for A (its refresh waiting on the provider), after B restored Linear, is refused — B keeps its session', async () => {
    await signIn(A);
    connectorRegistry.register(linearConnectorSDK);
    let finishRefresh!: (value: { accessToken: string }) => void;
    vi.spyOn(oauthManager, 'refreshAndPersist').mockImplementation(() => new Promise((resolve) => (finishRefresh = resolve)));
    vi.stubGlobal('fetch', vi.fn(async () => linearIdentity('b-org')));
    const aRestore = call('connectivity:restore', 'linear', scopeOf(A), { accessToken: 'a-linear', refreshToken: 'a-refresh', expiresAt: Date.now() - 1000 });
    await vi.waitFor(() => expect(finishRefresh).toBeTypeOf('function'));

    await signIn(B);
    expect(await call('connectivity:restore', 'linear', scopeOf(B), { accessToken: 'b-linear', refreshToken: 'b-refresh', expiresAt: Date.now() + 3_600_000 })).toMatchObject({ ok: true, data: { state: 'connected' } });
    finishRefresh({ accessToken: 'a-linear-refreshed' });

    expect(await aRestore).toMatchObject({ ok: false, error: expect.stringMatching(/account changed/) });
    expect(await linearConnectorSDK.getFreshAccessToken()).toBe('b-linear');
    expect(await connectionManager.listConnections(scopeOf(B))).toHaveLength(1);
    expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
    expect(linearLive()).toBe(true);
  });

  it('the same account signing out and back in is a new session: an operation from before is still discarded', async () => {
    await signIn(A);
    let finishAuthorization!: (value: { code: string; codeVerifier: string; redirectUri: string }) => void;
    vi.spyOn(oauthManager, 'beginAuthorization').mockResolvedValue({ requestId: 'r', authorizationUrl: 'u', result: new Promise((resolve) => (finishAuthorization = resolve)) } as never);
    vi.spyOn(oauthManager, 'exchangeCodeForToken').mockResolvedValue({ accessToken: 'old-session-token', grantedScopes: [] } as never);
    vi.stubGlobal('fetch', vi.fn(async () => json({ login: 'a-user' })));
    const connecting = gitHubConnectorSDK.connect(scopeOf(A));
    await accountSession.update(null);
    await signIn(A);
    finishAuthorization({ code: 'c', codeVerifier: 'v', redirectUri: 'x' });
    await expect(connecting).rejects.toBeInstanceOf(StaleAccountOperationError);
    expect(await gitHubConnectorSDK.getStatus(scopeOf(A))).toMatchObject({ state: 'disconnected' });
  });
});

describe('deployment profiles belong to the signed-in account — by scope and by id', () => {
  const config = { kind: 'managedPlatform', connectorId: 'vercel' };
  const createAs = async (userId: string, name: string) => {
    const created = await callNoEvent('connectivity:deploymentProfiles:create', scopeOf(userId), name, config);
    expect(created).toMatchObject({ ok: true });
    return created.data.id as string;
  };
  /** A's profile still held in memory while B is the verified account (no account-change event, so
   *  nothing was forgotten) — the id guard on its own. */
  const asIfBSignedIn = () => vi.spyOn(accountSession, 'verifiedUserId', 'get').mockReturnValue(B);

  it('the same account creates, gets, updates, lists and removes its own profile by id', async () => {
    await signIn(A);
    const id = await createAs(A, 'Production');
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ ok: true, data: { id, name: 'Production' } });
    expect(await callNoEvent('connectivity:deploymentProfiles:update', id, { name: 'Prod' })).toMatchObject({ ok: true, data: { name: 'Prod' } });
    expect(await callNoEvent('connectivity:deploymentProfiles:list', scopeOf(A))).toMatchObject({ ok: true, data: [{ id }] });
    expect(await callNoEvent('connectivity:deploymentProfiles:remove', id)).toMatchObject({ ok: true });
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ ok: true, data: undefined });
  });

  it("B cannot get, update, remove or take over A's profile by its id — it behaves like an id that doesn't exist", async () => {
    await signIn(A);
    const id = await createAs(A, 'Production');
    const spy = asIfBSignedIn();
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ ok: true, data: undefined });
    const update = await callNoEvent('connectivity:deploymentProfiles:update', id, { name: 'Hijacked' });
    const unknown = await callNoEvent('connectivity:deploymentProfiles:update', 'no-such-profile', { name: 'Hijacked' });
    expect(update).toMatchObject({ ok: false, error: expect.stringMatching(/no deployment profile found/) });
    expect(unknown).toMatchObject({ ok: false, error: expect.stringMatching(/no deployment profile found/) }); // indistinguishable
    expect(await callNoEvent('connectivity:deploymentProfiles:remove', id)).toMatchObject({ ok: true });
    const takeover = await callNoEvent('connectivity:deploymentProfiles:hydrate', { id, scope: scopeOf(B), name: 'Mine now', config, isDefault: false, createdAt: 1, updatedAt: 1 });
    expect(takeover).toMatchObject({ ok: false });
    expect(await callNoEvent('connectivity:deploymentProfiles:list', scopeOf(B))).toMatchObject({ ok: true, data: [] });
    spy.mockRestore();
    // A's profile is untouched by any of it.
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ ok: true, data: { id, name: 'Production', scope: { userId: A } } });
  });

  it('a guessed or forged id reveals nothing and changes nothing', async () => {
    await signIn(A);
    const id = await createAs(A, 'Production');
    for (const guess of ['00000000-0000-4000-8000-000000000000', `${id}x`, '../' + id]) {
      expect(await callNoEvent('connectivity:deploymentProfiles:get', guess)).toMatchObject({ ok: true, data: undefined });
      expect(await callNoEvent('connectivity:deploymentProfiles:update', guess, { name: 'x' })).toMatchObject({ ok: false });
    }
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ data: { name: 'Production' } });
  });

  it('signed out: no profile is created, returned, changed or removed', async () => {
    await signIn(A);
    const id = await createAs(A, 'Production');
    const spy = vi.spyOn(accountSession, 'verifiedUserId', 'get').mockReturnValue(null);
    expect(await callNoEvent('connectivity:deploymentProfiles:create', scopeOf(A), 'Another', config)).toMatchObject({ ok: false });
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ ok: true, data: undefined });
    expect(await callNoEvent('connectivity:deploymentProfiles:update', id, { name: 'x' })).toMatchObject({ ok: false });
    await callNoEvent('connectivity:deploymentProfiles:remove', id);
    spy.mockRestore();
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ data: { name: 'Production' } });
  });

  it('an account change forgets every profile held in memory (each account re-hydrates its own)', async () => {
    await signIn(A);
    const id = await createAs(A, 'Production');
    await signIn(B);
    await signIn(A);
    expect(await callNoEvent('connectivity:deploymentProfiles:get', id)).toMatchObject({ ok: true, data: undefined });
  });
});

describe('a refused write only affects the integration that obtained the token', () => {
  it("another integration's active session is untouched", async () => {
    await signIn(B);
    const github = fakeConnector('github');
    const gitlab = fakeConnector('gitlab');
    connectorRegistry.register(github.sdk);
    connectorRegistry.register(gitlab.sdk);
    try {
      await expect(credentialVaultBridge.store('github', scopeOf(A), 'stale', 'oauth2')).rejects.toThrow();
      expect(github.forget).toHaveBeenCalledTimes(1);
      expect(gitlab.forget).not.toHaveBeenCalled();
    } finally {
      connectorRegistry.unregister('gitlab');
    }
  });

  it("a refused MCP credential (the connector's separate MCP sign-in) leaves the connector's own session alone", async () => {
    await signIn(B);
    const github = fakeConnector('github');
    connectorRegistry.register(github.sdk);
    await expect(credentialVaultBridge.store(mcpCredentialId('github'), scopeOf(A), 'stale-mcp', 'oauth2')).rejects.toThrow();
    expect(github.forget).not.toHaveBeenCalled();
  });
});

describe("each real connector can forget its token locally — no provider revoke, no stored-copy change", () => {
  const all = [bitbucketConnectorSDK, gitHubConnectorSDK, gitLabConnectorSDK, googleWorkspaceConnectorSDK, jiraConnectorSDK, linearConnectorSDK, microsoftConnectorSDK, netlifyConnectorSDK, railwayConnectorSDK, slackConnectorSDK, vercelConnectorSDK];

  it('all 11 connectors implement forgetLocalSession()', () => {
    for (const sdk of all) expect(typeof sdk.forgetLocalSession, sdk.definition.id).toBe('function');
  });

  it('GitHub: connected from a restored token, then forgotten — disconnected, nothing configured, no network', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await gitHubConnectorSDK.authenticate(scopeOf(A), { accessToken: 'a-gh', login: 'a' });
      expect(await gitHubConnectorSDK.getStatus(scopeOf(A))).toMatchObject({ state: 'connected' });
      expect(infrastructureConnectorRegistry.listConfigured('sourceControl').length).toBeGreaterThan(0);
      gitHubConnectorSDK.forgetLocalSession();
      expect(await gitHubConnectorSDK.getStatus(scopeOf(A))).toMatchObject({ state: 'disconnected' });
      expect(infrastructureConnectorRegistry.listConfigured('sourceControl')).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * Everything a connector operation changes AFTER an await — the shared tool registries, the
 * connection list, the durable store — is checked against the account at that point, not only when
 * the operation started: a disconnect, refresh, restore, status read or health check still running
 * for an account that is no longer signed in (or for an earlier session of the same account) never
 * touches the session that replaced it.
 */
describe('late results after an account change never touch the session that replaced it', () => {
  const ALL = [bitbucketConnectorSDK, gitHubConnectorSDK, gitLabConnectorSDK, googleWorkspaceConnectorSDK, jiraConnectorSDK, linearConnectorSDK, microsoftConnectorSDK, netlifyConnectorSDK, railwayConnectorSDK, slackConnectorSDK, vercelConnectorSDK];
  /** A restored credential every integration accepts (each reads only the fields it needs). */
  const credentialFor = (who: string) => ({
    accessToken: `${who}-token`,
    login: who,
    username: who,
    cloudId: `${who}-cloud`,
    siteUrl: 'https://example.atlassian.net',
    siteName: who,
    userPrincipalName: `${who}@example.com`,
    teamName: who,
    grantedScopes: [],
  });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  /** Every tool connector the integrations have published for the assistant to use, and whether each is configured. */
  const liveTools = () =>
    [
      ...(['sourceControl', 'projectManagement', 'hosting'] as const).flatMap((kind) => infrastructureConnectorRegistry.list(kind) as object[]),
      ...(['documentProvider', 'mailboxProvider', 'calendarProvider', 'contactsProvider'] as const).flatMap((kind) => officeConnectorRegistry.list(kind) as object[]),
    ].map((tool) => ({ tool, configured: (tool as { isConfigured(): boolean }).isConfigured() }));
  const expectSameLiveTools = (before: ReturnType<typeof liveTools>, after: ReturnType<typeof liveTools>) => {
    expect(after).toHaveLength(before.length);
    before.forEach((b, i) => {
      expect(after[i].tool).toBe(b.tool); // never replaced…
      expect(after[i].configured).toBe(b.configured); // …and never blanked in place
    });
  };
  const googleToolsConfigured = () => officeConnectorRegistry.list('documentProvider').some((c) => (c as { isConfigured(): boolean }).isConfigured());
  /** Makes the next call of `method` wait until released. */
  function holdNext<T extends object>(target: T, method: keyof T) {
    const held: { release?: (value?: unknown) => void; fail?: (error: Error) => void } = {};
    vi.spyOn(target as any, method as any).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          held.release = resolve;
          held.fail = reject;
        })
    );
    return {
      reached: () => vi.waitFor(() => expect(held.release).toBeTypeOf('function')),
      release: (value?: unknown) => held.release!(value),
      fail: (error: Error) => held.fail!(error),
    };
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => json({})));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const sdk of ALL) sdk.forgetLocalSession();
    for (const id of ['googleWorkspace', 'jira', 'linear']) connectorRegistry.unregister(id);
  });

  describe('G1 — a disconnect for A finishing after B restored the same integration', () => {
    for (const sdk of ALL) {
      it(`${sdk.definition.id}: stops at the first await after the switch — B's session and live tools are untouched`, async () => {
        await signIn(A);
        vi.spyOn(oauthManager, 'revokeToken').mockResolvedValue(undefined);
        await sdk.authenticate(scopeOf(A), credentialFor('a'));
        const vaultRevoke = holdNext(credentialVaultBridge, 'revoke');
        const disconnecting = sdk.disconnect(scopeOf(A));
        await vaultRevoke.reached();

        await signIn(B);
        await sdk.authenticate(scopeOf(B), credentialFor('b'));
        const before = liveTools();
        vaultRevoke.release();

        await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
        expectSameLiveTools(before, liveTools());
        expect(await sdk.getStatus(scopeOf(B))).toMatchObject({ state: 'connected' });
      });
    }

    it("Google Workspace: A's provider revoke returning after B restored — B's Drive, Gmail, Calendar and Contacts stay configured", async () => {
      await signIn(A);
      await googleWorkspaceConnectorSDK.authenticate(scopeOf(A), credentialFor('a'));
      const providerRevoke = holdNext(oauthManager, 'revokeToken');
      const vaultRevoke = vi.spyOn(credentialVaultBridge, 'revoke');
      const disconnecting = googleWorkspaceConnectorSDK.disconnect(scopeOf(A));
      await providerRevoke.reached();

      await signIn(B);
      await googleWorkspaceConnectorSDK.authenticate(scopeOf(B), credentialFor('b'));
      expect(googleToolsConfigured()).toBe(true);
      const before = liveTools();
      providerRevoke.release();

      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expectSameLiveTools(before, liveTools());
      expect(googleToolsConfigured()).toBe(true);
      expect(await googleWorkspaceConnectorSDK.getStatus(scopeOf(B))).toMatchObject({ state: 'connected' });
      expect(vaultRevoke).not.toHaveBeenCalled(); // nothing after the provider call ran
    });

    it("Jira: A's provider revoke returning after B restored — B's live Jira connector is not replaced", async () => {
      await signIn(A);
      await jiraConnectorSDK.authenticate(scopeOf(A), credentialFor('a'));
      const providerRevoke = holdNext(oauthManager, 'revokeToken');
      const metadataClear = vi.spyOn(jiraMetadataStore, 'clear');
      const disconnecting = jiraConnectorSDK.disconnect(scopeOf(A));
      await providerRevoke.reached();

      await signIn(B);
      await jiraConnectorSDK.authenticate(scopeOf(B), credentialFor('b'));
      const liveJira = infrastructureConnectorRegistry.get('projectManagement', 'jira');
      expect((liveJira as unknown as { isConfigured(): boolean }).isConfigured()).toBe(true);
      const before = liveTools();
      providerRevoke.release();

      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expectSameLiveTools(before, liveTools());
      expect(infrastructureConnectorRegistry.get('projectManagement', 'jira')).toBe(liveJira);
      expect(metadataClear).not.toHaveBeenCalled();
      expect(await jiraConnectorSDK.getStatus(scopeOf(B))).toMatchObject({ state: 'connected' });
    });

    it("Google Workspace: A's refresh failing after B restored never blanks B's tools", async () => {
      await signIn(A);
      await googleWorkspaceConnectorSDK.authenticate(scopeOf(A), { ...credentialFor('a'), refreshToken: 'a-refresh' });
      const refresh = holdNext(oauthManager, 'refreshAndPersist');
      const refreshing = googleWorkspaceConnectorSDK.refresh(scopeOf(A));
      await refresh.reached();

      await signIn(B);
      await googleWorkspaceConnectorSDK.authenticate(scopeOf(B), credentialFor('b'));
      const before = liveTools();
      refresh.fail(new Error('invalid_grant'));
      await refreshing;

      expectSameLiveTools(before, liveTools());
      expect(googleToolsConfigured()).toBe(true);
      expect(await googleWorkspaceConnectorSDK.getStatus(scopeOf(B))).toMatchObject({ state: 'connected' });
    });

    it("through IPC: A's disconnect is refused once B restored — B's connection record and session stay", async () => {
      await signIn(A);
      connectorRegistry.register(googleWorkspaceConnectorSDK);
      expect(await call('connectivity:restore', 'googleWorkspace', scopeOf(A), credentialFor('a'))).toMatchObject({ ok: true });
      const [aConnection] = await connectionManager.listConnections(scopeOf(A));
      const providerRevoke = holdNext(oauthManager, 'revokeToken');
      const disconnecting = call('connectivity:disconnect', aConnection.id);
      await providerRevoke.reached();

      await signIn(B);
      expect(await call('connectivity:restore', 'googleWorkspace', scopeOf(B), credentialFor('b'))).toMatchObject({ ok: true, data: { state: 'connected' } });
      providerRevoke.release();

      expect(await disconnecting).toMatchObject({ ok: false, error: expect.stringMatching(/account changed/) });
      expect(await connectionManager.listConnections(scopeOf(B))).toMatchObject([{ status: 'connected' }]);
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
      expect(googleToolsConfigured()).toBe(true);
    });
  });

  describe('G2 — a restore from an earlier session never removes the newer record', () => {
    for (const [name, between] of [
      ['A signs out and back in', async () => {
        await accountSession.update(null);
        await signIn(A);
      }],
      ['A → B → A', async () => {
        await signIn(B);
        await signIn(A);
      }],
    ] as const) {
      it(`${name}: the old restore is refused and A's current connection stays listed and live`, async () => {
        await signIn(A);
        connectorRegistry.register(linearConnectorSDK);
        const refresh = holdNext(oauthManager, 'refreshAndPersist');
        vi.stubGlobal('fetch', vi.fn(async () => json({ data: { viewer: { name: 'a' }, organization: { name: 'a-org' } } })));
        const oldRestore = call('connectivity:restore', 'linear', scopeOf(A), { accessToken: 'a-old', refreshToken: 'r', expiresAt: Date.now() - 1000 });
        await refresh.reached();

        await between();
        expect(await call('connectivity:restore', 'linear', scopeOf(A), { accessToken: 'a-new', refreshToken: 'r2', expiresAt: Date.now() + 3_600_000 })).toMatchObject({ ok: true });
        expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(1);
        refresh.release({ accessToken: 'a-old-refreshed' });

        expect(await oldRestore).toMatchObject({ ok: false, error: expect.stringMatching(/account changed/) });
        expect(await connectionManager.listConnections(scopeOf(A))).toMatchObject([{ status: 'connected' }]);
        expect(await linearConnectorSDK.getFreshAccessToken()).toBe('a-new');
      });
    }
  });

  describe('G3 — late status reads and health checks never insert or overwrite records', () => {
    async function restoreLinear(userId: string, token: string) {
      vi.stubGlobal('fetch', vi.fn(async () => json({ data: { viewer: { name: userId }, organization: { name: `${userId}-org` } } })));
      expect(await call('connectivity:restore', 'linear', scopeOf(userId), { accessToken: token, expiresAt: Date.now() + 3_600_000 })).toMatchObject({ ok: true });
    }

    it("a health check for A finishing after B signed in doesn't bring A's record back", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      await restoreLinear(A, 'a-linear');
      const [aConnection] = await connectionManager.listConnections(scopeOf(A));
      const health = holdNext(linearConnectorSDK, 'health');
      const checking = callNoEvent('connectivity:checkHealth', aConnection.id);
      await health.reached();

      await signIn(B);
      health.release({ status: 'healthy' });
      expect(await checking).toMatchObject({ ok: false, error: expect.stringMatching(/account changed/) });
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
      expect(await connectionManager.listConnections(scopeOf(B))).toHaveLength(0);
    });

    it("a health check from A's earlier session doesn't overwrite A's current record (A → B → A)", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      await restoreLinear(A, 'a-linear');
      const [aConnection] = await connectionManager.listConnections(scopeOf(A));
      const health = holdNext(linearConnectorSDK, 'health');
      const checking = callNoEvent('connectivity:checkHealth', aConnection.id);
      await health.reached();

      await signIn(B);
      await signIn(A);
      await restoreLinear(A, 'a-linear-2');
      health.release({ status: 'unhealthy' });
      expect(await checking).toMatchObject({ ok: false });
      const [current] = await connectionManager.listConnections(scopeOf(A));
      expect(current).toMatchObject({ status: 'connected' });
      expect(current.healthStatus).toBeUndefined(); // the old session's result was not recorded
    });

    it("a health check finishing after the same account disconnected doesn't bring the record back", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      await restoreLinear(A, 'a-linear');
      const [aConnection] = await connectionManager.listConnections(scopeOf(A));
      const health = holdNext(linearConnectorSDK, 'health');
      const checking = callNoEvent('connectivity:checkHealth', aConnection.id);
      await health.reached();

      expect(await call('connectivity:disconnect', aConnection.id)).toMatchObject({ ok: true });
      health.release({ status: 'healthy' });
      await checking;
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
    });

    it('a health check never writes its earlier snapshot over status that changed while it ran (same session)', async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      await restoreLinear(A, 'a-linear');
      const [aConnection] = await connectionManager.listConnections(scopeOf(A));
      const health = holdNext(linearConnectorSDK, 'health');
      const checking = callNoEvent('connectivity:checkHealth', aConnection.id);
      await health.reached();

      vi.spyOn(linearConnectorSDK, 'getStatus').mockResolvedValueOnce({ state: 'requiresReauth', capabilities: [] });
      await connectionManager.getConnectorStatus('linear', scopeOf(A));
      health.release({ status: 'unhealthy' });
      expect(await checking).toMatchObject({ ok: true });
      expect(await connectionManager.listConnections(scopeOf(A))).toMatchObject([{ status: 'needsReauth', healthStatus: 'unhealthy' }]);
    });

    it("a status read from A's earlier session doesn't overwrite A's current record as disconnected", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      await restoreLinear(A, 'a-linear');
      const status = holdNext(linearConnectorSDK, 'getStatus');
      const reading = connectionManager.getConnectorStatus('linear', scopeOf(A));
      await status.reached();

      await accountSession.update(null);
      await signIn(A);
      await restoreLinear(A, 'a-linear-2');
      status.release({ state: 'disconnected', capabilities: [] });
      await reading.catch(() => undefined);
      expect(await connectionManager.listConnections(scopeOf(A))).toMatchObject([{ status: 'connected' }]);
      expect(await linearConnectorSDK.getStatus(scopeOf(A))).toMatchObject({ state: 'connected' });
    });

    it("a status read for A finishing after B signed in doesn't insert A's record", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      await restoreLinear(A, 'a-linear');
      const status = holdNext(linearConnectorSDK, 'getStatus');
      const reading = connectionManager.getConnectorStatus('linear', scopeOf(A));
      await status.reached();

      await signIn(B);
      status.release({ state: 'connected', capabilities: ['readIssues'] });
      await reading.catch(() => undefined);
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
    });
  });

  describe('G4 (main side) — a refreshed credential is persisted only for the account signed in at that moment', () => {
    const appWindow = () => ({ id: 7, isDestroyed: () => false, send: vi.fn() });

    it("while B's sign-in is still being verified, A's credential is not handed to the window (whose session is already B's)", async () => {
      await signIn(A);
      await credentialVaultBridge.store('github', scopeOf(A), 'a-token', 'oauth2');
      const window = appWindow();
      connectionManager.rememberCredentialPersistSender(window as never);
      let verifyB!: (verdict: Verdict) => void;
      verifier.answer = () => new Promise((resolve) => (verifyB = resolve));
      const switching = accountSession.update(tokenFor(B));

      const persisting = connectionManager.persistStoredCredential('github', scopeOf(A));
      verifyB({ userId: B });
      await switching;
      expect(await persisting).toBe(false);
      expect(window.send).not.toHaveBeenCalled();
    });
  });

  describe('the same account, uninterrupted: connect, refresh, restore and disconnect work as before', () => {
    for (const sdk of ALL) {
      it(`${sdk.definition.id}: restore then disconnect — disconnected and its tools unconfigured`, async () => {
        await signIn(A);
        vi.spyOn(oauthManager, 'revokeToken').mockResolvedValue(undefined);
        await sdk.authenticate(scopeOf(A), credentialFor('a'));
        expect(await sdk.getStatus(scopeOf(A))).toMatchObject({ state: 'connected' });
        await sdk.disconnect(scopeOf(A));
        expect(await sdk.getStatus(scopeOf(A))).toMatchObject({ state: 'disconnected' });
        expect(liveTools().filter((t) => t.configured)).toHaveLength(0);
      });
    }

    it('Google Workspace: a refresh for the same account updates its token and keeps its tools configured', async () => {
      await signIn(A);
      await googleWorkspaceConnectorSDK.authenticate(scopeOf(A), { ...credentialFor('a'), refreshToken: 'a-refresh' });
      vi.spyOn(oauthManager, 'refreshAndPersist').mockResolvedValue({ accessToken: 'a-token-2', refreshToken: 'a-refresh' } as never);
      await googleWorkspaceConnectorSDK.refresh(scopeOf(A));
      expect(googleToolsConfigured()).toBe(true);
      expect(await googleWorkspaceConnectorSDK.getStatus(scopeOf(A))).toMatchObject({ state: 'connected' });
    });

    it('Linear through IPC: restore, status, health check, persist and disconnect keep one consistent record', async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      vi.stubGlobal('fetch', vi.fn(async () => json({ data: { viewer: { name: 'a' }, organization: { name: 'a-org' } } })));
      expect(await call('connectivity:restore', 'linear', scopeOf(A), { accessToken: 'a-linear', expiresAt: Date.now() + 3_600_000 })).toMatchObject({ ok: true });
      expect(await call('connectivity:getStatus', 'linear', scopeOf(A))).toMatchObject({ ok: true, data: { state: 'connected' } });
      const [connection] = await connectionManager.listConnections(scopeOf(A));
      vi.spyOn(linearConnectorSDK, 'health').mockResolvedValueOnce({ status: 'healthy' } as never);
      expect(await callNoEvent('connectivity:checkHealth', connection.id)).toMatchObject({ ok: true, data: { healthStatus: 'healthy' } });
      expect(await connectionManager.listConnections(scopeOf(A))).toMatchObject([{ status: 'connected', healthStatus: 'healthy' }]);
      expect(await call('connectivity:disconnect', connection.id)).toMatchObject({ ok: true });
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(0);
      expect(await linearConnectorSDK.getStatus(scopeOf(A))).toMatchObject({ state: 'disconnected' });
    });

    it('a connect for the same account still stores, registers and lists its connection', async () => {
      await signIn(A);
      vi.spyOn(oauthManager, 'beginAuthorization').mockResolvedValue({ requestId: 'r', authorizationUrl: 'u', result: Promise.resolve({ code: 'c', codeVerifier: 'v', redirectUri: 'x' }) } as never);
      vi.spyOn(oauthManager, 'exchangeCodeForToken').mockResolvedValue({ accessToken: 'a-github', grantedScopes: [] } as never);
      vi.stubGlobal('fetch', vi.fn(async () => json({ login: 'a-user' })));
      connectorRegistry.register(gitHubConnectorSDK);
      expect(await call('connectivity:connect', 'github', scopeOf(A))).toMatchObject({ ok: true });
      expect(await connectionManager.listConnections(scopeOf(A))).toHaveLength(1);
      expect(infrastructureConnectorRegistry.listConfigured('sourceControl').map((c) => c.id)).toContain('github');
    });
  });
  describe('every later step of a disconnect, and every durable write, checks the session again', () => {
    const MCP = mcpCredentialId('linear');
    /** An app window whose renderer answers each durable-store request when told to (or at once). */
    function appWindow(opts: { answerAtOnce?: boolean } = {}) {
      const requests: { channel: string; requestId: string }[] = [];
      const window = {
        id: 41,
        isDestroyed: () => false,
        send: vi.fn((channel: string, request: { requestId: string }) => {
          requests.push({ channel, requestId: request.requestId });
          if (opts.answerAtOnce) queueMicrotask(() => answer(request.requestId));
        }),
      };
      function answer(requestId: string) {
        const channel = [...handlers.keys()].find((key) => key.endsWith(`:${requestId}`))!;
        handlers.get(channel)!({ sender: window }, { ok: true });
      }
      return { window, requests, answer };
    }
    async function restoreLinearFor(userId: string, token: string) {
      vi.stubGlobal('fetch', vi.fn(async () => json({ data: { viewer: { name: userId }, organization: { name: `${userId}-org` } } })));
      expect(await call('connectivity:restore', 'linear', scopeOf(userId), { accessToken: token, expiresAt: Date.now() + 3_600_000 })).toMatchObject({ ok: true });
      const [connection] = await connectionManager.listConnections(scopeOf(userId));
      return connection;
    }
    const resignInA = async () => {
      await accountSession.update(null);
      await signIn(A);
    };

    it("Jira: A's metadata clear returning after B restored — B's live Jira connector stays", async () => {
      await signIn(A);
      vi.spyOn(oauthManager, 'revokeToken').mockResolvedValue(undefined);
      await jiraConnectorSDK.authenticate(scopeOf(A), credentialFor('a'));
      const metadataClear = holdNext(jiraMetadataStore, 'clear');
      const disconnecting = jiraConnectorSDK.disconnect(scopeOf(A));
      await metadataClear.reached();

      await signIn(B);
      await jiraConnectorSDK.authenticate(scopeOf(B), credentialFor('b'));
      const liveJira = infrastructureConnectorRegistry.get('projectManagement', 'jira');
      metadataClear.release();
      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expect(infrastructureConnectorRegistry.get('projectManagement', 'jira')).toBe(liveJira);
      expect(await jiraConnectorSDK.getStatus(scopeOf(B))).toMatchObject({ state: 'connected' });
    });

    for (const step of ['provider revoke', 'vault removal'] as const) {
      it(`Jira: A's ${step} returning after A signed in again — A's new stored token and site details are kept`, async () => {
        await signIn(A);
        await jiraConnectorSDK.authenticate(scopeOf(A), credentialFor('a'));
        const held = step === 'provider revoke' ? holdNext(oauthManager, 'revokeToken') : holdNext(credentialVaultBridge, 'revoke');
        if (step === 'vault removal') vi.spyOn(oauthManager, 'revokeToken').mockResolvedValue(undefined);
        const disconnecting = jiraConnectorSDK.disconnect(scopeOf(A));
        await held.reached();

        await resignInA();
        await credentialVaultBridge.store('jira', scopeOf(A), 'a-jira-new', 'oauth2');
        await jiraMetadataStore.store(scopeOf(A), { cloudId: 'a-cloud', siteUrl: 'https://a.atlassian.net', siteName: 'a', storedAt: 1 });
        held.release();
        await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
        expect((await credentialVaultBridge.read('jira', scopeOf(A)))?.secret).toBe('a-jira-new');
        expect(await jiraMetadataStore.read(scopeOf(A))).toMatchObject({ cloudId: 'a-cloud' });
      });
    }

    it("an integration's disconnect returning after B restored: ConnectionManager itself keeps B's record", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      const aConnection = await restoreLinearFor(A, 'a-linear');
      const sdkDisconnect = holdNext(linearConnectorSDK, 'disconnect'); // an integration without its own guard
      const disconnecting = connectionManager.disconnect(aConnection.id);
      await sdkDisconnect.reached();

      await resignInA();
      await restoreLinearFor(A, 'a-linear-2');
      sdkDisconnect.release();
      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expect(await connectionManager.listConnections(scopeOf(A))).toMatchObject([{ status: 'connected' }]);
    });

    it("the stored copy's removal answered after A signed in again: A's new MCP sign-in is not removed", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      const aConnection = await restoreLinearFor(A, 'a-linear');
      const { window, requests, answer } = appWindow();
      const disconnecting = connectionManager.disconnect(aConnection.id, window as never);
      await vi.waitFor(() => expect(requests).toHaveLength(1)); // the stored connector credential's removal

      await resignInA();
      await credentialVaultBridge.store(MCP, scopeOf(A), 'a-mcp-new', 'oauth2');
      answer(requests[0].requestId);
      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expect((await credentialVaultBridge.read(MCP, scopeOf(A)))?.secret).toBe('a-mcp-new');
      expect(requests).toHaveLength(1); // no removal of the stored MCP sign-in was asked for
    });

    it("the MCP sign-in lookup returning after A signed in again: A's new MCP sign-in is not removed", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      const aConnection = await restoreLinearFor(A, 'a-linear');
      const original = credentialVaultBridge.read.bind(credentialVaultBridge);
      let releaseLookup!: () => void;
      vi.spyOn(credentialVaultBridge, 'read').mockImplementation((id, scope) =>
        id === MCP && !releaseLookup
          ? new Promise((resolve) => (releaseLookup = () => resolve({ secret: 'a-mcp-old', authMethod: 'oauth2' } as never)))
          : original(id, scope)
      );
      const disconnecting = connectionManager.disconnect(aConnection.id);
      await vi.waitFor(() => expect(releaseLookup).toBeTypeOf('function'));

      await resignInA();
      await credentialVaultBridge.store(MCP, scopeOf(A), 'a-mcp-new', 'oauth2');
      releaseLookup();
      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expect((await original(MCP, scopeOf(A)))?.secret).toBe('a-mcp-new');
    });

    it("the MCP sign-in's removal returning after A signed in again: its stored copy is not removed", async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      const aConnection = await restoreLinearFor(A, 'a-linear');
      await credentialVaultBridge.store(MCP, scopeOf(A), 'a-mcp', 'oauth2');
      const original = credentialVaultBridge.revoke.bind(credentialVaultBridge);
      let releaseRevoke!: () => void;
      vi.spyOn(credentialVaultBridge, 'revoke').mockImplementation((id, scope) =>
        id === MCP && !releaseRevoke ? new Promise<void>((resolve) => (releaseRevoke = resolve)) : original(id, scope)
      );
      const { window, requests } = appWindow({ answerAtOnce: true });
      const disconnecting = connectionManager.disconnect(aConnection.id, window as never);
      await vi.waitFor(() => expect(releaseRevoke).toBeTypeOf('function'));
      expect(requests).toHaveLength(1); // the connector credential's stored copy

      await resignInA();
      releaseRevoke();
      await expect(disconnecting).rejects.toBeInstanceOf(StaleAccountOperationError);
      expect(requests).toHaveLength(1); // the MCP sign-in's stored copy was left alone
    });

    it("a refresh persisting from A's earlier session (A signed out and back in meanwhile) writes nothing", async () => {
      await signIn(A);
      await credentialVaultBridge.store('github', scopeOf(A), 'a-token', 'oauth2');
      const { window } = appWindow({ answerAtOnce: true });
      connectionManager.rememberCredentialPersistSender(window as never);
      const vaultRead = holdNext(credentialVaultBridge, 'read');
      const persisting = connectionManager.persistStoredCredential('github', scopeOf(A));
      await vaultRead.reached();

      await resignInA();
      vaultRead.release({ secret: 'a-token', authMethod: 'oauth2' });
      expect(await persisting).toBe(false);
      expect(window.send).not.toHaveBeenCalled();
    });

    it('the same account, uninterrupted: disconnect removes the stored copy and the MCP sign-in; a refresh is persisted', async () => {
      await signIn(A);
      connectorRegistry.register(linearConnectorSDK);
      const aConnection = await restoreLinearFor(A, 'a-linear');
      await credentialVaultBridge.store(MCP, scopeOf(A), 'a-mcp', 'oauth2');
      const { window, requests } = appWindow({ answerAtOnce: true });
      await connectionManager.disconnect(aConnection.id, window as never);
      expect(requests).toHaveLength(2); // the connector credential and the MCP sign-in
      expect(await credentialVaultBridge.read(MCP, scopeOf(A))).toBeUndefined();

      await credentialVaultBridge.store('github', scopeOf(A), 'a-token', 'oauth2');
      connectionManager.rememberCredentialPersistSender(window as never);
      expect(await connectionManager.persistStoredCredential('github', scopeOf(A))).toBe(true);
      expect(requests).toHaveLength(3);
    });
  });
});
