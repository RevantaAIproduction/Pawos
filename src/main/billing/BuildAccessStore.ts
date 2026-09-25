import type { BuildAccessState, BuildAccessStatus, BuildAccessSyncResult } from '../../shared/billing/BillingTypes';

/**
 * The signed-in account's PawOS Build access — server-authoritative, memory-only.
 *
 * PawOS Build is a private, admin-granted student tier (see
 * supabase/migrations/20260924000000_pawos_build_access.sql). Membership and expiry live only in
 * Supabase; this store is a short-lived cache of what get_my_build_access() last returned for the
 * current session's access token. It is intentionally never written to disk: editing local files
 * (subscription.json etc.) cannot produce Build access, and a fresh app start has no Build access
 * until the renderer's auth listener re-syncs it from the server.
 *
 * Expiry is enforced locally on every read (isActive) against the server's endsAt, corrected by the
 * clock offset observed at sync time, and re-confirmed by the server on every token refresh.
 */

type SyncResult = BuildAccessSyncResult;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const VALID_STATUSES: BuildAccessStatus[] = ['none', 'active', 'expired', 'revoked'];

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Validates the raw RPC payload. Throws on anything malformed rather than guessing. */
export function parseBuildAccessResponse(raw: unknown, localNow: number): { access: BuildAccessState; serverOffsetMs: number } {
  if (!raw || typeof raw !== 'object') throw new Error('Build access response was not an object');
  const r = raw as Record<string, unknown>;
  const status = r.status as BuildAccessStatus;
  if (!VALID_STATUSES.includes(status)) throw new Error(`Unknown Build access status: ${String(r.status)}`);

  const serverNow = parseTime(r.serverNow);
  if (serverNow === null) throw new Error('Build access response is missing serverNow');

  const startsAt = parseTime(r.startsAt);
  const endsAt = parseTime(r.endsAt);
  if (status !== 'none' && (startsAt === null || endsAt === null || endsAt <= startsAt)) {
    throw new Error('Build access response has an invalid access window');
  }

  return {
    access: {
      status,
      cohortId: typeof r.cohortId === 'string' ? r.cohortId : null,
      startsAt: status === 'none' ? null : startsAt,
      endsAt: status === 'none' ? null : endsAt,
      revokedAt: parseTime(r.revokedAt),
      syncedAt: localNow,
    },
    serverOffsetMs: serverNow - localNow,
  };
}

class BuildAccessStore {
  private state: BuildAccessState | null = null;
  /** serverNow - localNow at the last sync; applied so a wrong/rolled-back local clock can't extend access. */
  private serverOffsetMs = 0;
  private listeners = new Set<() => void>();
  private expiryTimer: NodeJS.Timeout | null = null;

  get(): BuildAccessState | null {
    return this.state;
  }

  /** Server-corrected "now". */
  now(localNow = Date.now()): number {
    return localNow + this.serverOffsetMs;
  }

  /** True only for a server-confirmed active grant whose window contains the current (server-corrected) time. */
  isActive(localNow = Date.now()): boolean {
    const s = this.state;
    if (!s || s.status !== 'active' || s.startsAt === null || s.endsAt === null) return false;
    const now = this.now(localNow);
    return now >= s.startsAt && now < s.endsAt;
  }

  /** Start of the Build access window (epoch ms, server clock) — the anchor for Build's weekly capacity cycle. */
  getStartsAt(): number | null {
    return this.isActive() ? this.state?.startsAt ?? null : null;
  }

  /** End of the Build access window (epoch ms, server clock) — no weekly reset happens at or after it. */
  getEndsAt(): number | null {
    return this.isActive() ? this.state?.endsAt ?? null : null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[BuildAccessStore] change listener failed:', err);
      }
    }
  }

  /** Replaces the cached state (tests and sync). Schedules a change notification at expiry. */
  set(access: BuildAccessState | null, serverOffsetMs = 0): void {
    this.state = access;
    this.serverOffsetMs = serverOffsetMs;
    this.scheduleExpiryNotification();
    this.emit();
  }

  clear(): void {
    if (this.state === null && this.serverOffsetMs === 0) return;
    this.set(null, 0);
  }

  /**
   * Fetches the caller's own grant from Supabase with their access token. A rejected token, server
   * error or malformed response clears the cached state (fail closed) — a Build user who can't be
   * verified falls back to their base tier. Only a transport failure keeps the previous state.
   */
  async sync(accessToken: string, fetchImpl: FetchLike = fetch): Promise<SyncResult> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !anonKey) {
      this.clear();
      return { ok: false, reason: 'Supabase is not configured' };
    }
    if (!accessToken) {
      this.clear();
      return { ok: false, reason: 'Missing access token' };
    }

    let response: Response;
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/get_my_build_access`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch (err) {
      // Transport failure only (offline/DNS): keep the last server-confirmed state — isActive() still
      // bounds it by the server's endsAt — rather than dropping a verified student for a network blip.
      return { ok: false, reason: `Could not reach Supabase: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.clear();
      return { ok: false, reason: `get_my_build_access failed (${response.status}): ${body.slice(0, 300)}` };
    }

    try {
      const { access, serverOffsetMs } = parseBuildAccessResponse(await response.json(), Date.now());
      this.set(access, serverOffsetMs);
      return { ok: true, access };
    } catch (err) {
      this.clear();
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  private scheduleExpiryNotification(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (!this.isActive() || this.state?.endsAt === null || this.state?.endsAt === undefined) return;
    // setTimeout's max delay is ~24.8 days; re-arm in chunks until the real expiry is reached.
    const remaining = this.state.endsAt - this.now();
    const delay = Math.min(Math.max(remaining, 0) + 1000, 2 ** 31 - 1);
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      if (this.isActive()) {
        this.scheduleExpiryNotification();
      } else {
        this.emit();
      }
    }, delay);
    this.expiryTimer.unref?.();
  }
}

export const buildAccessStore = new BuildAccessStore();
