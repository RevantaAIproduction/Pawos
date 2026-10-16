import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionRequest } from '../../shared/actions/ActionTypes';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-account-gate-userdata-'));
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  Notification: vi.fn(),
}));
vi.mock('../memory/entities/fileEntities', () => ({ onFileCreated: vi.fn(), onFileModified: vi.fn(), onFileDeleted: vi.fn(), onFileMoved: vi.fn(), onFileRenamed: vi.fn() }));
vi.mock('../memory/entities/codingRuntimeMemoryEntities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../memory/entities/codingRuntimeMemoryEntities')>()),
  recordCodingEditHistory: vi.fn(),
}));
// Usage metering is billing's concern, not this test's.
vi.mock('./CodingRuntimeUsageBoundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./CodingRuntimeUsageBoundary')>()),
  enforceCodingRuntimeUsage: vi.fn(async () => null),
}));

// The real AccountSession class — only the Supabase call behind it is replaced, so sign-in, refresh,
// sign-out and the offline rule are the app's own logic.
type Verdict = { userId: string } | { userId: null; networkError: boolean };
const verifier = vi.hoisted(() => ({ answer: (_token: string): Verdict => ({ userId: null, networkError: false }) }));
vi.mock('../auth/AccountSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/AccountSession')>();
  return { ...actual, accountSession: new actual.AccountSession(async (token) => verifier.answer(token)) };
});

import { DesktopExecutionEngine } from './DesktopExecutionEngine';
import { accountSession } from '../auth/AccountSession';
import { entitlementService } from '../billing/EntitlementService';
import { subscriptionStore } from '../billing/SubscriptionStore';
import { codingModeStore } from './CodingModeStore';

/**
 * Signed-out execution: coding and infrastructure execution need an account the main process has
 * verified itself. Nothing on the request — an account id, a flag, a scope — stands in for it.
 */

const tokenFor = (sub: string) =>
  `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;

let project = '';
beforeEach(async () => {
  verifier.answer = () => ({ userId: null, networkError: false });
  await accountSession.update(null);
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-account-gate-project-'));
  fs.writeFileSync(path.join(project, 'package.json'), '{"name":"demo"}');
  vi.spyOn(codingModeStore, 'getMode').mockReturnValue('pro');
});
afterEach(() => vi.restoreAllMocks());

const writeIn = (name: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'writeFile', path: path.join(project, name), content: 'x\n', confirmed: true, executionId: `exec-${name}`, ...extra }) as unknown as ActionRequest;

async function signIn(userId: string) {
  verifier.answer = (token) => (token === tokenFor(userId) ? { userId } : { userId: null, networkError: false });
  await accountSession.update(tokenFor(userId));
  expect(accountSession.verifiedUserId).toBe(userId);
}

describe('signed out', () => {
  it('refuses file writes, commands, builds and deploys before anything runs', async () => {
    const engine = new DesktopExecutionEngine();
    const write = await engine.execute(writeIn('a.txt'));
    expect(write).toMatchObject({ ok: false, reason: 'account-restricted' });
    expect((write as { message?: string }).message).toMatch(/sign in/i);
    expect(fs.existsSync(path.join(project, 'a.txt'))).toBe(false);

    for (const request of [
      { type: 'runCommand', command: 'node -e "require(\'fs\').writeFileSync(\'ran.txt\',\'1\')"', cwd: project, confirmed: true },
      { type: 'buildProject', cwd: project, confirmed: true },
      { type: 'deployProject', cwd: project, environment: 'preview', confirmed: true },
    ]) {
      expect(await engine.execute(request as unknown as ActionRequest)).toMatchObject({ ok: false, reason: 'account-restricted' });
    }
    expect(fs.existsSync(path.join(project, 'ran.txt'))).toBe(false);
  });

  it('a renderer-supplied identity is ignored: account ids, flags and scope on the request grant nothing', async () => {
    const engine = new DesktopExecutionEngine();
    const forged = writeIn('forged.txt', {
      accountId: 'user-1',
      userId: 'user-1',
      verifiedUserId: 'user-1',
      signedIn: true,
      scope: { organizationId: 'org-1', accountId: 'user-1' },
    });
    expect(await engine.execute(forged)).toMatchObject({ ok: false, reason: 'account-restricted' });
    expect(fs.existsSync(path.join(project, 'forged.txt'))).toBe(false);
  });

  it('a token Supabase rejects (forged, expired or malformed) leaves the account unverified', async () => {
    const engine = new DesktopExecutionEngine();
    for (const token of [tokenFor('user-1'), 'not-a-jwt', '']) {
      await accountSession.update(token);
      expect(accountSession.verifiedUserId).toBeNull();
      expect(await engine.execute(writeIn('t.txt'))).toMatchObject({ ok: false, reason: 'account-restricted' });
    }
  });

  it('read-only and local actions outside the execution groups still run', async () => {
    const engine = new DesktopExecutionEngine();
    const list = await engine.execute({ type: 'listDirectory', path: project } as ActionRequest);
    expect(list).not.toMatchObject({ reason: 'account-restricted' });
    expect(await engine.execute({ type: 'getCodingMode' } as ActionRequest)).toMatchObject({ ok: true });
  });
});

describe('signed in (verified by the main process)', () => {
  it('runs: the file is written', async () => {
    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
    vi.spyOn(entitlementService, 'isRuntimeEntitled').mockReturnValue(true);
    await signIn('user-1');
    const engine = new DesktopExecutionEngine();
    expect(await engine.execute(writeIn('ok.txt'))).toMatchObject({ ok: true });
    expect(fs.readFileSync(path.join(project, 'ok.txt'), 'utf8')).toBe('x\n');
  });

  it('keeps the existing plan rules: Paw Go may execute; the local Coding mode and a missing entitlement still block, each with its own reason', async () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' } as ReturnType<typeof subscriptionStore.get>);
    await signIn('user-1');
    const engine = new DesktopExecutionEngine();
    expect(await engine.execute(writeIn('go.txt'))).toMatchObject({ ok: true });

    vi.spyOn(codingModeStore, 'getMode').mockReturnValue('go');
    const local = await engine.execute(writeIn('mode.txt'));
    expect(local).toMatchObject({ ok: false, reason: 'coding-mode-restricted' });
    expect((local as { message?: string }).message).toMatch(/Coding mode/);

    vi.spyOn(codingModeStore, 'getMode').mockReturnValue('pro');
    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(false);
    const plan = await engine.execute(writeIn('plan.txt'));
    expect(plan).toMatchObject({ ok: false, reason: 'entitlement-restricted' });
    expect((plan as { message?: string }).message).toMatch(/plan/);
    expect(fs.existsSync(path.join(project, 'mode.txt')) || fs.existsSync(path.join(project, 'plan.txt'))).toBe(false);
  });

  it('offline after a verified sign-in: the same account stays signed in; a different account or sign-out does not', async () => {
    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
    vi.spyOn(entitlementService, 'isRuntimeEntitled').mockReturnValue(true);
    await signIn('user-1');
    const engine = new DesktopExecutionEngine();

    verifier.answer = () => ({ userId: null, networkError: true });
    await accountSession.update(tokenFor('user-1')); // a refreshed token for the same account, while offline
    expect(accountSession.verifiedUserId).toBe('user-1');
    expect(await engine.execute(writeIn('offline.txt'))).toMatchObject({ ok: true });

    await accountSession.update(tokenFor('user-2')); // someone else's token can't be verified offline
    expect(accountSession.verifiedUserId).toBeNull();
    expect(await engine.execute(writeIn('other.txt'))).toMatchObject({ ok: false, reason: 'account-restricted' });

    await signIn('user-1');
    await accountSession.update(null); // sign-out
    expect(await engine.execute(writeIn('after-signout.txt'))).toMatchObject({ ok: false, reason: 'account-restricted' });
    expect(fs.existsSync(path.join(project, 'other.txt')) || fs.existsSync(path.join(project, 'after-signout.txt'))).toBe(false);
  });

  it('token refresh online: a new token for the same account keeps execution available; a refresh Supabase rejects ends it', async () => {
    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
    vi.spyOn(entitlementService, 'isRuntimeEntitled').mockReturnValue(true);
    await signIn('user-1');
    const engine = new DesktopExecutionEngine();
    const refreshed = `${tokenFor('user-1')}.refreshed`;
    verifier.answer = (token) => (token === refreshed ? { userId: 'user-1' } : { userId: null, networkError: false });
    await accountSession.update(refreshed);
    expect(accountSession.verifiedUserId).toBe('user-1');
    expect(await engine.execute(writeIn('refreshed.txt'))).toMatchObject({ ok: true });

    await accountSession.update(`${tokenFor('user-1')}.revoked`); // Supabase says no (401): signed out
    expect(accountSession.verifiedUserId).toBeNull();
    expect(await engine.execute(writeIn('revoked.txt'))).toMatchObject({ ok: false, reason: 'account-restricted' });
    expect(fs.existsSync(path.join(project, 'revoked.txt'))).toBe(false);
  });

  it('offline from a cold start (never verified): execution stays blocked', async () => {
    verifier.answer = () => ({ userId: null, networkError: true });
    await accountSession.update(tokenFor('user-1'));
    expect(accountSession.verifiedUserId).toBeNull();
    expect(await new DesktopExecutionEngine().execute(writeIn('cold.txt'))).toMatchObject({ ok: false, reason: 'account-restricted' });
  });
});
