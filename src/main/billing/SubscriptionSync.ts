import { subscriptionStore } from './SubscriptionStore';
import { callRpcAsUser, getServerAccessToken } from '../auth/ServerSessionToken';

const PAWOS_WEB_URL = process.env.PAWOS_WEB_URL || 'https://pawos.revantaai.com';

type ServerSubscription = {
  userId: string;
  active: boolean;
  tier: 'pro' | 'proMax' | null;
  proMaxVariant: '5x' | '20x' | null;
  status: string | null;
  expiresAt: string | null;
  hasHistory: boolean;
  serverNow: string;
};

export type SubscriptionSyncResult = 'applied' | 'cleared' | 'unchanged' | 'error';

let expiryTimer: NodeJS.Timeout | null = null;
/** Accounts already sent through "restore purchases" this session — it runs at most once each. */
const restoreAttempted = new Set<string>();

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * A plan bought before the server kept plan records exists only in this device's local file. Asks
 * pawos-web to record the account's own Razorpay subscriptions (/api/billing/restore-subscription —
 * ownership is checked there against Razorpay's notes.userId), so the plan becomes server-backed
 * and follows the account from then on.
 *   'recorded' — the server now has the plan; 'none' — Razorpay confirms this account bought no
 *   subscription, so the local plan isn't real; 'skipped' / 'error' — nothing learned, keep as is.
 */
async function restoreLegacyPurchase(userId: string, fetchImpl: FetchLike = fetch): Promise<'recorded' | 'none' | 'skipped' | 'error'> {
  const local = subscriptionStore.get();
  const holdsUnbackedPlan =
    (local.tier === 'pro' || local.tier === 'proMax') &&
    (local.status === 'active' || local.status === 'trialing') &&
    !local.serverVerified &&
    (!local.accountId || local.accountId === userId);
  const token = getServerAccessToken();
  if (!holdsUnbackedPlan || !token || restoreAttempted.has(userId)) return 'skipped';
  restoreAttempted.add(userId);
  try {
    const response = await fetchImpl(`${PAWOS_WEB_URL}/api/billing/restore-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; recorded?: number } | null;
    if (!response.ok || !body?.ok) return 'error';
    return (body.recorded ?? 0) > 0 ? 'recorded' : 'none';
  } catch (err) {
    console.error('[Subscription] Restore purchases failed:', err instanceof Error ? err.message : err);
    return 'error';
  }
}

/**
 * Restores the signed-in account's paid plan from the server (get_my_subscription — see
 * supabase/migrations/20260925060000_pawos_subscriptions.sql), so a plan follows the ACCOUNT rather
 * than this device's local file: sign out, use another account, sign back in and it's back, until it
 * expires. Runs on every sign-in, app start and token refresh (billing:syncBuildAccess), so renewals
 * extend it and cancellations/halts let it lapse.
 *
 *  - server has a paid plan      → applied (paid through its expiry, corrected for clock skew)
 *  - server knows the account but nothing is paid now → cleared back to the free tier
 *  - server has no record at all → if this device holds a paid plan bought before the server kept
 *    records, "restore purchases" records it server-side first; otherwise unchanged
 *  - call failed (offline, etc.)  → unchanged; the local copy still lapses at its own expiry
 *
 * `onChange` fires when the effective plan may have changed — immediately, and again at expiry.
 */
export async function syncSubscriptionFromServer(onChange: () => void, now = Date.now()): Promise<SubscriptionSyncResult> {
  let server: ServerSubscription;
  try {
    server = await callRpcAsUser<ServerSubscription>('get_my_subscription', {});
    if (server && typeof server.userId === 'string' && !server.hasHistory) {
      const restored = await restoreLegacyPurchase(server.userId);
      if (restored === 'recorded') server = await callRpcAsUser<ServerSubscription>('get_my_subscription', {});
      // Razorpay has no subscription for this account: a paid plan in the local file isn't real.
      if (restored === 'none') server = { ...server, hasHistory: true };
    }
  } catch (err) {
    console.error('[Subscription] Could not restore the plan from the server:', err instanceof Error ? err.message : err);
    return 'error';
  }
  if (!server || typeof server.userId !== 'string') return 'error';

  const serverOffsetMs = Date.parse(server.serverNow) - now;
  const expiresAt = server.expiresAt ? Date.parse(server.expiresAt) - (Number.isFinite(serverOffsetMs) ? serverOffsetMs : 0) : NaN;

  let result: SubscriptionSyncResult;
  if (server.active && (server.tier === 'pro' || server.tier === 'proMax') && Number.isFinite(expiresAt)) {
    subscriptionStore.applyServerSubscription(server.userId, { tier: server.tier, proMaxVariant: server.proMaxVariant, expiresAt });
    scheduleExpiry(expiresAt - now, onChange);
    result = 'applied';
  } else if (server.hasHistory) {
    subscriptionStore.clearServerSubscription(server.userId);
    result = 'cleared';
  } else {
    result = 'unchanged';
  }
  onChange();
  return result;
}

function scheduleExpiry(delayMs: number, onChange: () => void): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  // setTimeout caps at ~24.8 days; re-check in chunks until the plan's real expiry passes.
  const capped = Math.min(Math.max(delayMs, 0) + 1000, 2 ** 31 - 1);
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    const left = (subscriptionStore.get().renewsAt ?? 0) - Date.now();
    if (left > 0) scheduleExpiry(left, onChange);
    else onChange();
  }, capped);
  expiryTimer.unref?.();
}

/** Test hook: forget which accounts already went through restore this session. */
export function resetRestoreAttemptsForTests(): void {
  restoreAttempted.clear();
}
