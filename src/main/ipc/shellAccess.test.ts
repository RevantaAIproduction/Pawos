import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real AccountSession class — only the Supabase call behind it is replaced.
type Verdict = { userId: string } | { userId: null; networkError: boolean };
const verifier = vi.hoisted(() => ({ answer: (_token: string): Verdict => ({ userId: null, networkError: false }) }));
vi.mock('../auth/AccountSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/AccountSession')>();
  return { ...actual, accountSession: new actual.AccountSession(async (token) => verifier.answer(token)) };
});

import { accountSession } from '../auth/AccountSession';
import { SHELL_NEEDS_SIGN_IN, withSignedInAccount } from './shellAccess';

const tokenFor = (sub: string) =>
  `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;

beforeEach(async () => {
  verifier.answer = () => ({ userId: null, networkError: false });
  await accountSession.update(null);
});

describe('shell access needs a verified signed-in account', () => {
  it('signed out, or with a token Supabase rejects: nothing starts, the caller gets the sign-in refusal', async () => {
    const start = vi.fn(() => ({ ok: true }));
    expect(withSignedInAccount(start)).toEqual(SHELL_NEEDS_SIGN_IN);
    await accountSession.update(tokenFor('user-1')); // forged / expired: not verified
    expect(withSignedInAccount(start)).toEqual(SHELL_NEEDS_SIGN_IN);
    expect(start).not.toHaveBeenCalled();
  });

  it('signed in: it runs; after sign-out it stops running', async () => {
    verifier.answer = (token) => (token === tokenFor('user-1') ? { userId: 'user-1' } : { userId: null, networkError: false });
    await accountSession.update(tokenFor('user-1'));
    const start = vi.fn(() => ({ ok: true }));
    expect(withSignedInAccount(start)).toEqual({ ok: true });
    await accountSession.update(null);
    expect(withSignedInAccount(start)).toEqual(SHELL_NEEDS_SIGN_IN);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('ipc.ts routes every shell channel through it: the Terminal panel, the shared terminal, and typing into a process', () => {
    const source = fs.readFileSync(path.join(__dirname, 'ipc.ts'), 'utf8');
    for (const channel of ['terminal:startUserShell', 'remoteAssistance:startSharedTerminal', 'process:writeStdin']) {
      const at = source.indexOf(`ipcMain.handle('${channel}'`);
      expect(at, channel).toBeGreaterThan(-1);
      const handler = source.slice(at, source.indexOf('ipcMain.handle(', at + 10));
      expect(handler, channel).toMatch(/withSignedInAccount\(\(\) =>/);
    }
    // …and nothing else in ipc.ts starts a shell or writes to a process directly.
    const direct = source.match(/processManager\.(startInteractiveShell|writeStdin)\(/g) ?? [];
    const wrapped = source.match(/withSignedInAccount\(\(\) => (\{[^}]*?)?[\s\S]{0,200}?processManager\.(startInteractiveShell|writeStdin)\(/g) ?? [];
    expect(direct.length).toBe(3);
    expect(wrapped.length).toBe(3);
  });
});
