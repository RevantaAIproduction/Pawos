import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-platform-health-store-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
}));

import { platformHealthStore } from './PlatformHealthStore';
import { platformEventBus } from '../events/PlatformEventBus';

const FILE_PATH = path.join(tmp, 'platform-health-events.json');

// The store persists to one real file shared across every test in this
// file. Without resetting both the subscription (init() never unsubscribes
// a prior one — that's intentional; it's only ever called once per process
// in production) and the file itself between tests, listeners would
// accumulate and events would leak across tests.
beforeEach(() => {
  platformHealthStore.stopListening();
  try {
    fs.rmSync(FILE_PATH);
  } catch {
    // fine if it doesn't exist yet
  }
  platformHealthStore.init();
});

afterEach(() => {
  platformHealthStore.stopListening();
});

describe('PlatformHealthStore', () => {
  it('records every event reported on the Platform Event Bus once init() has run', () => {
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'coding', severity: 'info', status: 'ok' });

    const recent = platformHealthStore.list(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ kind: 'health', runtime: 'coding', status: 'ok' });
  });

  it('stops recording once stopListening() is called', () => {
    platformHealthStore.stopListening();

    const before = platformHealthStore.list(1000).length;
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'billing', severity: 'info', status: 'ok' });
    const after = platformHealthStore.list(1000).length;

    expect(after).toBe(before);
  });

  it('list() returns most-recent-first', () => {
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'coding', severity: 'info', status: 'ok', detail: 'first' });
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'coding', severity: 'info', status: 'ok', detail: 'second' });

    const recent = platformHealthStore.list(2);
    expect((recent[0] as { detail?: string }).detail).toBe('second');
    expect((recent[1] as { detail?: string }).detail).toBe('first');
  });

  it('listByRuntime filters to only the requested runtime', () => {
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'coding', severity: 'info', status: 'ok' });
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'billing', severity: 'info', status: 'ok' });

    const billingOnly = platformHealthStore.listByRuntime('billing', 10);
    expect(billingOnly.length).toBeGreaterThan(0);
    expect(billingOnly.every((e) => e.runtime === 'billing')).toBe(true);
  });

  it('listByKind filters to only the requested event kind', () => {
    platformEventBus.reportRuntimeEvent({ kind: 'crash', runtime: 'desktop', severity: 'critical', processType: 'renderer', message: 'gone' });
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'desktop', severity: 'info', status: 'ok' });

    const crashesOnly = platformHealthStore.listByKind('crash', 10);
    expect(crashesOnly.length).toBeGreaterThan(0);
    expect(crashesOnly.every((e) => e.kind === 'crash')).toBe(true);
  });

  it('persists across a fresh init() (reload from disk)', () => {
    platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'coding', severity: 'info', status: 'ok', detail: 'persisted' });
    platformHealthStore.stopListening();

    platformHealthStore.init();
    const recent = platformHealthStore.list(1);
    expect((recent[0] as { detail?: string }).detail).toBe('persisted');
  });

  it('caps stored entries at 500, evicting the oldest first', () => {
    for (let i = 0; i < 505; i++) {
      platformEventBus.reportRuntimeEvent({ kind: 'health', runtime: 'coding', severity: 'info', status: 'ok', detail: `n${i}` });
    }
    const all = platformHealthStore.list(1000);
    expect(all.length).toBe(500);
    expect((all[0] as { detail?: string }).detail).toBe('n504');
    expect((all[499] as { detail?: string }).detail).toBe('n5');
  });
});
