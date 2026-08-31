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
  it('Go: 5h=10 PC, weekly=50 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('go');
    expect(cap.window5hPc).toBe(10);
    expect(cap.windowWeeklyPc).toBe(50);
    expect(cap.pooled).toBe(false);
  });

  it('Pro: 5h=200 PC, weekly=500 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('pro');
    expect(cap.window5hPc).toBe(200);
    expect(cap.windowWeeklyPc).toBe(500);
    expect(cap.pooled).toBe(false);
  });

  it('Pro Max: 5h=2000 PC, weekly=10000 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('proMax');
    expect(cap.window5hPc).toBe(2_000);
    expect(cap.windowWeeklyPc).toBe(10_000);
    expect(cap.pooled).toBe(false);
  });

  it('Team Standard: 5h=200 PC/seat, weekly=500 PC/seat, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('team');
    expect(cap.window5hPc).toBe(200);
    expect(cap.windowWeeklyPc).toBe(500);
    expect(cap.pooled).toBe(false);
  });

  it('Team Premium: 5h=625 PC/seat, weekly=2500 PC/seat, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('team', 'premium');
    expect(cap.window5hPc).toBe(625);
    expect(cap.windowWeeklyPc).toBe(2_500);
    expect(cap.pooled).toBe(false);
  });

  it('Enterprise: 5h=4000 PC/seat, weekly=16000 PC/seat, pooled', () => {
    const cap = pawComputeCapacityStore.resolve('enterprise');
    expect(cap.window5hPc).toBe(4_000);
    expect(cap.windowWeeklyPc).toBe(16_000);
    expect(cap.pooled).toBe(true);
  });
});
