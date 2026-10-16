import { EventEmitter } from 'events';
import { createClient } from '@supabase/supabase-js';

/**
 * The signed-in account, as verified by the main process — the identity that scopes per-account
 * local records (Work History, file-change ledgers). The renderer never tells main WHO is signed in:
 * it hands over its Supabase access token (on sign-in, every refresh, and sign-out → null) and main
 * asks Supabase Auth whose token it is (`auth.getUser(token)` verifies the JWT server-side).
 *
 *   - valid token          → that user's id
 *   - signed out / invalid → no account (nothing per-account is readable or recorded)
 *   - network failure      → keeps the id it already verified, but only if the token is for that
 *                            same user (its `sub` claim) — never switches to an unverified account.
 *
 * Deliberately separate from EntitlementService's own user id (left exactly as it was).
 */

export type TokenVerifier = (accessToken: string) => Promise<{ userId: string } | { userId: null; networkError: boolean }>;

/** The `sub` claim of a JWT, without verifying it — used only to confirm a token belongs to the already-verified user. */
export function unverifiedSubject(accessToken: string): string | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')) as { sub?: unknown };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

export function supabaseTokenVerifier(): TokenVerifier {
  return async (accessToken) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return { userId: null, networkError: false };
    try {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.getUser(accessToken);
      if (data.user?.id) return { userId: data.user.id };
      // An auth error status (401/403…) is a real "not valid"; anything else is treated as unreachable.
      const status = (error as { status?: number } | null)?.status;
      return { userId: null, networkError: !(typeof status === 'number' && status >= 400 && status < 500) };
    } catch {
      return { userId: null, networkError: true };
    }
  };
}

export class AccountSession extends EventEmitter {
  private userId: string | null = null;
  private generation = 0;
  private epoch = 0;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(private readonly verify: TokenVerifier) {
    super();
  }

  /** The verified signed-in account, or null. */
  get verifiedUserId(): string | null {
    return this.userId;
  }

  /**
   * Increases every time the verified account changes (sign-in, sign-out, another account) — never
   * on a token refresh for the same account. Work started under one epoch belongs to that account.
   */
  get accountEpoch(): number {
    return this.epoch;
  }

  /**
   * The verified account once every verification already started has finished — for a check that
   * must not race the session the renderer has just sent (e.g. connectors restored right after
   * sign-in). Never waits for a session that hasn't been sent.
   */
  async whenSettled(): Promise<string | null> {
    let seen: Promise<unknown>;
    do {
      seen = this.inFlight;
      await seen;
    } while (seen !== this.inFlight);
    return this.verifiedUserId;
  }

  /**
   * The renderer's current session token (null = signed out). The latest call wins: a slower
   * verification of an older token never overrides a newer one.
   */
  update(accessToken: string | null): Promise<string | null> {
    const run = this.apply(accessToken);
    this.inFlight = run.catch(() => undefined);
    return run;
  }

  private async apply(accessToken: string | null): Promise<string | null> {
    const mine = ++this.generation;
    if (!accessToken) {
      this.set(null);
      return null;
    }
    const result = await this.verify(accessToken);
    if (mine !== this.generation) return this.userId;
    if (result.userId) {
      this.set(result.userId);
    } else if ('networkError' in result && result.networkError && this.userId !== null && unverifiedSubject(accessToken) === this.userId) {
      // Offline token refresh for the account already verified: keep it.
    } else {
      this.set(null);
    }
    return this.userId;
  }

  private set(userId: string | null): void {
    if (userId === this.userId) return;
    this.userId = userId;
    this.epoch += 1;
    this.emit('changed', userId);
  }
}

export const accountSession = new AccountSession(supabaseTokenVerifier());
