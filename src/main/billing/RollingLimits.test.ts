/**
 * Rolling limit regression — requirement 12.
 * Verifies the exact approved PC capacity values from PawComputeCapacityStore
 * have not drifted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/paw-cap-test' } }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => { throw new Error('no persisted config'); }),
    writeFileSync: vi.fn(),
  };
});

import { pawComputeCapacityStore } from './PawComputeCapacityStore';

beforeEach(() => { pawComputeCapacityStore.init(); });

describe('Rolling limits — exact approved values', () => {
  it('Go: 5h=null, weekly=1000 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('go');
    expect(cap.window5hPc).toBeNull();
    expect(cap.windowWeeklyPc).toBe(1_000);
    expect(cap.pooled).toBe(false);
  });

  it('Pro: 5h=null, weekly=5000 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('pro');
    expect(cap.window5hPc).toBeNull();
    expect(cap.windowWeeklyPc).toBe(5_000);
    expect(cap.pooled).toBe(false);
  });

  it('Pro Max: 5h=null, weekly=25000 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('proMax');
    expect(cap.window5hPc).toBeNull();
    expect(cap.windowWeeklyPc).toBe(25_000);
    expect(cap.pooled).toBe(false);
  });

  it('Team Standard: 5h=null, weekly=5000 PC/seat, pooled', () => {
    const cap = pawComputeCapacityStore.resolve('team');
    expect(cap.window5hPc).toBeNull();
    expect(cap.windowWeeklyPc).toBe(5_000);
    expect(cap.pooled).toBe(true);
  });

  it('Team Premium: 5h=null, weekly=25000 PC/seat, pooled', () => {
    const cap = pawComputeCapacityStore.resolve('team', 'premium');
    expect(cap.window5hPc).toBeNull();
    expect(cap.windowWeeklyPc).toBe(25_000);
    expect(cap.pooled).toBe(true);
  });

  it('Enterprise: 5h=null, weekly=null, pooled', () => {
    const cap = pawComputeCapacityStore.resolve('enterprise');
    expect(cap.window5hPc).toBeNull();
    expect(cap.windowWeeklyPc).toBeNull();
    expect(cap.pooled).toBe(true);
  });
});
