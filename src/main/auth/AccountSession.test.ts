import { describe, expect, it, vi } from 'vitest';
import { AccountSession, unverifiedSubject, type TokenVerifier } from './AccountSession';

/**
 * The account that scopes per-account records is only ever one Supabase Auth verified. The renderer
 * hands over a token; it cannot name an account.
 */

const jwt = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;

function verifierFor(table: Record<string, string>, offline = false): TokenVerifier {
  return vi.fn(async (token: string) => {
    if (offline) return { userId: null, networkError: true };
    const id = table[token];
    return id ? { userId: id } : { userId: null, networkError: false };
  });
}

describe('verified account session', () => {
  const tokenA = jwt('user-A');
  const tokenB = jwt('user-B');

  it('a valid token becomes that user; sign-out clears it', async () => {
    const session = new AccountSession(verifierFor({ [tokenA]: 'user-A' }));
    expect(await session.update(tokenA)).toBe('user-A');
    expect(session.verifiedUserId).toBe('user-A');
    expect(await session.update(null)).toBeNull();
    expect(session.verifiedUserId).toBeNull();
  });

  it('an invalid (or forged) token is no account — a claimed `sub` is never trusted on its own', async () => {
    const session = new AccountSession(verifierFor({ [tokenA]: 'user-A' }));
    await session.update(tokenA);
    const forged = jwt('user-B'); // looks like user B, but Supabase does not accept it
    expect(await session.update(forged)).toBeNull();
    expect(session.verifiedUserId).toBeNull();
  });

  it('switching accounts follows the verification, and emits a change', async () => {
    const session = new AccountSession(verifierFor({ [tokenA]: 'user-A', [tokenB]: 'user-B' }));
    const changes: Array<string | null> = [];
    session.on('changed', (id) => changes.push(id));
    await session.update(tokenA);
    await session.update(tokenB);
    await session.update(null);
    expect(changes).toEqual(['user-A', 'user-B', null]);
  });

  it('the latest token wins — a slow verification of an older token never overrides it', async () => {
    let releaseA!: () => void;
    const verify: TokenVerifier = (token) =>
      token === tokenA
        ? new Promise((resolve) => (releaseA = () => resolve({ userId: 'user-A' })))
        : Promise.resolve({ userId: 'user-B' });
    const session = new AccountSession(verify);
    const first = session.update(tokenA);
    await session.update(tokenB);
    releaseA();
    await first;
    expect(session.verifiedUserId).toBe('user-B');
  });

  it('offline refresh keeps the already-verified account only for a token of that same user', async () => {
    const online = verifierFor({ [tokenA]: 'user-A' });
    let offline = false;
    const session = new AccountSession((token) => (offline ? verifierFor({}, true)(token) : online(token)));
    await session.update(tokenA);
    offline = true;
    expect(await session.update(jwt('user-A'))).toBe('user-A'); // same user, network down → kept
    expect(await session.update(jwt('user-B'))).toBeNull(); // a different user can't be verified offline → none
  });

  it('reads the subject of a token without trusting it', () => {
    expect(unverifiedSubject(jwt('abc'))).toBe('abc');
    expect(unverifiedSubject('not-a-jwt')).toBeNull();
  });
});
