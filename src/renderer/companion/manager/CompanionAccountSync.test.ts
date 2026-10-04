import { beforeEach, describe, expect, it } from 'vitest';
import { COMPANION_SYNC_STATE_KEY, CompanionAccountSync, toAccountSelection, type AccountCompanion, type CompanionAccountBackend, type CompanionLocalStore } from './CompanionAccountSync';
import { createPawProfile, type CompanionProfile } from './CompanionProfileTypes';

/** A minimal in-memory CompanionProfileStore: Paw plus one locally-made Companion. */
class FakeStore implements CompanionLocalStore {
  profiles: CompanionProfile[] = [createPawProfile(), { ...createPawProfile(), id: 'local-robo', name: 'Robo', origin: 'upload', isDefault: false }];
  activeId = 'paw-default';
  private listeners = new Set<() => void>();
  list = () => this.profiles;
  getActive = () => this.profiles.find((p) => p.id === this.activeId)!;
  setActive(id: string) {
    this.activeId = id;
    this.listeners.forEach((l) => l());
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** The account record, as PawOS Web also reads and writes it. */
class FakeAccount implements CompanionAccountBackend {
  record: AccountCompanion = { companionId: 'paw-default', customCompanionName: null, companionUpdatedAt: new Date(1_000).toISOString() };
  offline = false;
  sets: Array<{ companionId: string | null; customName: string | null }> = [];
  constructor(private readonly clock: () => number) {}
  async get() {
    if (this.offline) throw new TypeError('fetch failed');
    return { ...this.record };
  }
  async set(selection: { companionId: string | null; customName: string | null }) {
    if (this.offline) throw new TypeError('fetch failed');
    this.sets.push(selection);
    this.record = { companionId: selection.companionId, customCompanionName: selection.customName, companionUpdatedAt: new Date(this.clock()).toISOString() };
    return { ...this.record };
  }
  /** A change made from PawOS Web. */
  changeFromWeb(companionId: string) {
    this.record = { companionId, customCompanionName: null, companionUpdatedAt: new Date(this.clock()).toISOString() };
  }
}

describe('CompanionAccountSync — Web ↔ account ↔ Desktop', () => {
  let time: number;
  let store: FakeStore;
  let account: FakeAccount;
  let storage: Map<string, string>;
  const clock = () => time;
  const storageApi = () => ({ getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) });
  const newSync = (accountId = 'user-1') => new CompanionAccountSync(accountId, store, account, storageApi(), clock);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    time = 10_000;
    store = new FakeStore();
    account = new FakeAccount(clock);
    storage = new Map();
  });

  it('maps an official Companion to its catalog id and a locally-made one to just its name', () => {
    expect(toAccountSelection(store.profiles[0])).toEqual({ companionId: 'paw-default', customName: null });
    expect(toAccountSelection(store.profiles[1])).toEqual({ companionId: null, customName: 'Robo' });
  });

  it('a Companion chosen on the desktop is saved to the account', async () => {
    const sync = newSync();
    sync.start();
    await sync.syncNow();

    time = 20_000;
    store.setActive('local-robo');
    await settle();
    await sync.syncNow();

    expect(account.record).toMatchObject({ companionId: null, customCompanionName: 'Robo' });
  });

  it('a Companion chosen on the web is applied on the desktop at the next sync', async () => {
    store.activeId = 'local-robo';
    const sync = newSync();
    sync.start();
    await sync.syncNow(); // first sync pushes the pre-existing local choice
    expect(account.record.customCompanionName).toBe('Robo');

    time = 30_000;
    account.changeFromWeb('paw-default');
    await sync.syncNow();

    expect(store.activeId).toBe('paw-default');
    expect(account.sets).toHaveLength(1); // applying the web change did not echo back as a new write
  });

  it('the first sync on a device adopts the account selection when the device is still on the default', async () => {
    account.record = { companionId: null, customCompanionName: 'Made elsewhere', companionUpdatedAt: new Date(5_000).toISOString() };
    const sync = newSync();
    await sync.syncNow();

    expect(store.activeId).toBe('paw-default'); // this device doesn't have that Companion, so it keeps its own
    expect(account.sets).toHaveLength(0); // and does not overwrite the account
  });

  it('offline: the last known Companion keeps working, and the change is pushed when connectivity returns', async () => {
    const sync = newSync();
    sync.start();
    await sync.syncNow();

    account.offline = true;
    time = 40_000;
    store.setActive('local-robo');
    await settle();
    await sync.syncNow();
    expect(store.activeId).toBe('local-robo');
    expect(account.record.companionId).toBe('paw-default'); // nothing reached the account yet

    account.offline = false;
    await sync.syncNow();
    expect(account.record).toMatchObject({ companionId: null, customCompanionName: 'Robo' });
  });

  it('a pending change survives an app restart', async () => {
    const first = newSync();
    first.start();
    await first.syncNow();
    account.offline = true;
    time = 40_000;
    store.setActive('local-robo');
    await settle();
    await first.syncNow();

    account.offline = false;
    await newSync().syncNow(); // a new process, same persisted sync state

    expect(account.record.customCompanionName).toBe('Robo');
  });

  it('a stale offline change does not overwrite a newer change made on the web', async () => {
    store.activeId = 'local-robo';
    const sync = newSync();
    sync.start();
    await sync.syncNow();

    account.offline = true;
    time = 50_000;
    store.setActive('paw-default'); // changed locally while offline…
    await settle();
    await sync.syncNow();

    time = 60_000;
    account.record = { companionId: null, customCompanionName: 'Robo', companionUpdatedAt: new Date(55_000).toISOString() }; // …then re-chosen elsewhere, later
    account.offline = false;
    const writesBefore = account.sets.length;
    await sync.syncNow();

    expect(account.sets).toHaveLength(writesBefore); // the stale local change was dropped, not pushed
    expect(account.record.customCompanionName).toBe('Robo');
  });

  it('editing a Companion without switching to another one writes nothing', async () => {
    const sync = newSync();
    sync.start();
    await sync.syncNow();

    store.setActive('paw-default'); // same Companion: e.g. a voice/personality edit notifying subscribers
    await settle();
    await sync.syncNow();

    expect(account.sets).toHaveLength(0);
  });

  it("never reuses another account's sync state on the same machine", async () => {
    storage.set(COMPANION_SYNC_STATE_KEY, JSON.stringify({ accountId: 'someone-else', lastRemoteUpdatedAt: account.record.companionUpdatedAt, pendingSince: 99_999 }));
    store.activeId = 'local-robo';
    const sync = newSync('user-1');
    await sync.syncNow();

    // Treated as this account's first sync: the existing local choice is recorded for user-1.
    expect(account.sets).toEqual([{ companionId: null, customName: 'Robo' }]);
    expect(JSON.parse(storage.get(COMPANION_SYNC_STATE_KEY)!).accountId).toBe('user-1');
  });
});
