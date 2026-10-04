import type { CompanionProfile } from './CompanionProfileTypes';

/**
 * Keeps this device's active Companion and the account's canonical Companion selection (one row
 * per account in account_profiles — see supabase/migrations/20261004000000_account_profile_companion.sql)
 * in step. PawOS Web writes the same record through the same database functions, so a Companion
 * chosen on the web reaches the desktop here, and a Companion chosen on the desktop reaches the
 * web and the public profile.
 *
 * The local CompanionProfileStore stays what the overlay actually renders from — it is the cache
 * that keeps the last known Companion working offline. This class only reconciles it with the
 * account:
 *
 *  - A local change is pushed as soon as it happens. If that fails (offline), it is remembered as
 *    pending and retried on the next sync.
 *  - On each sync the account is read first. A pending local change wins only if it is newer than
 *    the account's last change; otherwise the account wins and the stale local change is dropped.
 *  - With nothing pending, an account change since the last sync is applied locally — when this
 *    device has that Companion. A Companion built on another machine (a "custom" selection) has no
 *    local profile here, so the device keeps showing what it has.
 *  - The first sync on a device adopts the account's selection unless the user had already picked
 *    a non-default Companion locally, which is treated as their existing choice and pushed.
 *
 * What is synced is the selection only. Locally-made Companions (uploaded models) stay on the
 * machine that made them; the account records just their name.
 */

export interface AccountCompanion {
  /** A catalog Companion id, or null when the account's selection is a device-local Companion. */
  companionId: string | null;
  customCompanionName: string | null;
  /** ISO timestamp of the account's last Companion change. */
  companionUpdatedAt: string;
}

export interface CompanionAccountBackend {
  get(): Promise<AccountCompanion>;
  set(selection: { companionId: string | null; customName: string | null }): Promise<AccountCompanion>;
}

/** The slice of CompanionProfileStore this needs — keeps the sync testable without a DOM store. */
export interface CompanionLocalStore {
  list(): CompanionProfile[];
  getActive(): CompanionProfile;
  setActive(id: string): void;
  subscribe(listener: () => void): () => void;
}

export interface SyncStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PersistedSyncState {
  accountId: string;
  /** companionUpdatedAt of the account record as of the last successful sync on this device. */
  lastRemoteUpdatedAt: string | null;
  /** Set while a local change has not reached the account yet: when the change was made (epoch ms). */
  pendingSince: number | null;
}

export const COMPANION_SYNC_STATE_KEY = 'pawos:companions:accountSync';
const DEFAULT_PAW_ID = 'paw-default';

/** Official Companions are catalog entries addressed by id; anything else exists only on this device. */
export function toAccountSelection(profile: CompanionProfile): { companionId: string | null; customName: string | null } {
  return profile.origin === 'official' ? { companionId: profile.id, customName: null } : { companionId: null, customName: profile.name.trim().slice(0, 80) || 'Custom companion' };
}

export class CompanionAccountSync {
  private state: PersistedSyncState;
  private lastActiveId: string;
  private applyingRemote = false;
  private inFlight: Promise<void> | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly accountId: string,
    private readonly store: CompanionLocalStore,
    private readonly backend: CompanionAccountBackend,
    private readonly storage: SyncStateStorage,
    private readonly now: () => number = () => Date.now()
  ) {
    this.state = this.loadState();
    this.lastActiveId = store.getActive().id;
  }

  private loadState(): PersistedSyncState {
    try {
      const parsed = JSON.parse(this.storage.getItem(COMPANION_SYNC_STATE_KEY) ?? 'null') as PersistedSyncState | null;
      // Sync state from a different account on this machine must never be reused.
      if (parsed && parsed.accountId === this.accountId) return parsed;
    } catch {
      // fall through to a fresh state
    }
    return { accountId: this.accountId, lastRemoteUpdatedAt: null, pendingSince: null };
  }

  private saveState(patch: Partial<PersistedSyncState>): void {
    this.state = { ...this.state, ...patch };
    try {
      this.storage.setItem(COMPANION_SYNC_STATE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage full/unavailable: the in-memory state still drives this session.
    }
  }

  /** Begins watching local changes and runs a first sync. Returns a function that stops watching. */
  start(): () => void {
    this.unsubscribe = this.store.subscribe(() => this.onLocalChange());
    void this.syncNow();
    return () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    };
  }

  private onLocalChange(): void {
    const activeId = this.store.getActive().id;
    if (activeId === this.lastActiveId) return; // an edit to a profile, not a change of Companion
    this.lastActiveId = activeId;
    if (this.applyingRemote) return;
    this.saveState({ pendingSince: this.now() });
    void this.syncNow();
  }

  /** Reconciles once. Never throws: a failure leaves any pending change in place for the next sync. */
  syncNow(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.reconcile()
        .catch(() => {
          // Offline or signed out — the local Companion keeps working; retried on the next sync.
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }
    return this.inFlight;
  }

  private async reconcile(): Promise<void> {
    const remote = await this.backend.get();
    const remoteChangedAt = Date.parse(remote.companionUpdatedAt);
    const firstSync = this.state.lastRemoteUpdatedAt === null;
    const active = this.store.getActive();

    const localChoicePredatesSync = firstSync && this.state.pendingSince === null && active.id !== DEFAULT_PAW_ID;
    const pendingIsNewer = this.state.pendingSince !== null && !(remoteChangedAt > this.state.pendingSince);

    if (pendingIsNewer || localChoicePredatesSync) {
      const selection = toAccountSelection(active);
      if (selection.companionId === remote.companionId && selection.customName === remote.customCompanionName) {
        this.saveState({ lastRemoteUpdatedAt: remote.companionUpdatedAt, pendingSince: null });
        return;
      }
      const pushedAt = this.state.pendingSince;
      const saved = await this.backend.set(selection);
      // Only clear the pending marker if no newer local change arrived while this push was in flight.
      this.saveState({ lastRemoteUpdatedAt: saved.companionUpdatedAt, pendingSince: this.state.pendingSince === pushedAt ? null : this.state.pendingSince });
      return;
    }

    if (firstSync || remote.companionUpdatedAt !== this.state.lastRemoteUpdatedAt || this.state.pendingSince !== null) {
      this.applyRemote(remote);
    }
    this.saveState({ lastRemoteUpdatedAt: remote.companionUpdatedAt, pendingSince: null });
  }

  private applyRemote(remote: AccountCompanion): void {
    if (remote.companionId === null) return; // a Companion local to some other device
    if (this.store.getActive().id === remote.companionId) return;
    if (!this.store.list().some((profile) => profile.id === remote.companionId)) return; // this build doesn't have it
    this.applyingRemote = true;
    try {
      this.store.setActive(remote.companionId);
      this.lastActiveId = remote.companionId;
    } finally {
      this.applyingRemote = false;
    }
  }
}
