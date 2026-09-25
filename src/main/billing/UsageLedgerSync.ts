import { usageEventStore, type LedgerAnchors, type LedgerSyncEvent, type UsageScope } from './UsageEventStore';
import { deviceFingerprint } from './DeviceIdentity';
import { callRpcAsUser, getServerAccessToken } from '../auth/ServerSessionToken';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the server keeps (and returns) events — longer than any limit period. */
const WINDOW_MS = 40 * DAY_MS;
/** Re-send a little before the last sync, in case an event was recorded mid-sync. */
const OVERLAP_MS = 60 * 60 * 1000;
const BATCH = 500;
const DEBOUNCE_MS = 15_000;

type ServerLedger = { anchors: Partial<LedgerAnchors>; events: LedgerSyncEvent[]; serverNow?: number };

/**
 * Keeps the server copy of the usage ledgers (sync_usage_ledger — see
 * supabase/migrations/20260925070000_pawos_usage_ledger.sql) in step with this device, so deleting or
 * editing the local usage files no longer resets anyone's limits:
 *   - DEVICE ledger (free Paw Go) — keyed by this PC's fingerprint (DeviceIdentity.ts);
 *   - ACCOUNT ledger (paid tiers, PawOS Build) — keyed by the signed-in account; it also follows the
 *     account to other devices.
 * Uploads new usage, then merges back anything missing locally and the server's cycle anchors, which
 * can't be rewound. Runs on every sign-in / app start / token refresh, and shortly after usage.
 * Best-effort: offline or signed out, the local ledger simply keeps working.
 */
export async function syncUsageLedger(scope: UsageScope, now = Date.now()): Promise<number | null> {
  if (!getServerAccessToken()) return null;
  if (scope === 'account' && !usageEventStore.hasAccountLedger()) return null;
  const since = Math.max(now - WINDOW_MS, 0);
  const local = usageEventStore.exportForServer(scope, since);
  if (!local) return null;

  const uploadFrom = local.lastSyncedAt ? Math.max(local.lastSyncedAt - OVERLAP_MS, since) : since;
  const pending = local.events.filter((e) => e.at >= uploadFrom);
  const device = scope === 'device' ? deviceFingerprint() : null;

  let server: ServerLedger | null = null;
  try {
    // Upload in batches (the server accepts ≤500 per call); the last response carries the full state.
    let offset = 0;
    do {
      const batch = pending.slice(offset, offset + BATCH);
      server = await callRpcAsUser<ServerLedger>('sync_usage_ledger', {
        p_scope: scope,
        p_device: device,
        p_anchors: local.anchors,
        p_events: batch,
      });
      offset += BATCH;
    } while (offset < pending.length);
  } catch (err) {
    console.error(`[UsageLedger] ${scope} ledger sync failed:`, err instanceof Error ? err.message : err);
    return null;
  }
  if (!server) return null;
  return usageEventStore.mergeFromServer(scope, server, now);
}

let onRestored: (() => void) | null = null;

/** Called whenever a sync brought back usage the device didn't have (so the UI can refresh). */
export function onUsageLedgerRestored(listener: () => void): void {
  onRestored = listener;
}

/** Syncs the device ledger and, when an account is loaded, the account ledger. */
export async function syncAllUsageLedgers(): Promise<void> {
  const added = ((await syncUsageLedger('device')) ?? 0) + ((await syncUsageLedger('account')) ?? 0);
  if (added > 0) onRestored?.();
}

let timer: NodeJS.Timeout | null = null;

/** Queue a sync shortly after new usage (debounced — one sync per burst of activity). */
export function scheduleUsageLedgerSync(delayMs = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncAllUsageLedgers();
  }, delayMs);
  timer.unref?.();
}
