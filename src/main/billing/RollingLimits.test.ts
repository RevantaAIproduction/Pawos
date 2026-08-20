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
  it('Go: 5h=132 PC, weekly=528 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('go');
    expect(cap.window5hPc).toBe(132);
    expect(cap.window7dPc).toBe(528);
    expect(cap.pooled).toBe(false);
  });

  it('Pro: 5h=400 PC, weekly=1600 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('pro');
    expect(cap.window5hPc).toBe(400);
    expect(cap.window7dPc).toBe(1_600);
    expect(cap.pooled).toBe(false);
  });

  it('Pro Max: 5h=2000 PC, weekly=8000 PC, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('proMax');
    expect(cap.window5hPc).toBe(2_000);
    expect(cap.window7dPc).toBe(8_000);
    expect(cap.pooled).toBe(false);
  });

  it('Team Standard: 5h=800 PC/seat, weekly=3200 PC/seat, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('team');
    expect(cap.window5hPc).toBe(800);
    expect(cap.window7dPc).toBe(3_200);
    expect(cap.pooled).toBe(false);
  });

  it('Team Premium: 5h=2000 PC/seat, weekly=8000 PC/seat, not pooled', () => {
    const cap = pawComputeCapacityStore.resolve('team', 'premium');
    expect(cap.window5hPc).toBe(2_000);
    expect(cap.window7dPc).toBe(8_000);
    expect(cap.pooled).toBe(false);
  });

  it('Enterprise: 5h=4000 PC/seat, weekly=16000 PC/seat, pooled', () => {
    const cap = pawComputeCapacityStore.resolve('enterprise');
    expect(cap.window5hPc).toBe(4_000);
    expect(cap.window7dPc).toBe(16_000);
    expect(cap.pooled).toBe(true);
  });
});
