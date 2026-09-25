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
  // [tier, seatTier, proMaxVariant] -> 5h PC, weekly PC, 5h active hours, weekly active hours, pooled.
  // The 5-hour window cap is part of the weekly total, never extra capacity.
  it.each([
    ['Go', 'go', undefined, undefined, 1_000, 1_000, null, 5, false],
    ['PawOS Build', 'build', undefined, undefined, 500, 1_500, 5, 15, false],
    ['Pro', 'pro', undefined, undefined, 1_250, 5_000, 5, 20, false],
    ['Pro Max 5x', 'proMax', undefined, '5x', 4_166.6667, 25_000, 5, 30, false],
    ['Pro Max 20x', 'proMax', undefined, '20x', 12_500, 100_000, 5, 40, false],
    ['Team Standard', 'team', undefined, undefined, 1_250, 5_000, null, 20, true],
    ['Team Premium', 'team', 'premium', undefined, 4_166.6667, 25_000, null, 30, true],
    ['Enterprise', 'enterprise', undefined, undefined, null, null, null, null, true],
  ] as const)('%s', (_label, tier, seatTier, variant, pc5h, pcWeek, h5h, hWeek, pooled) => {
    const cap = pawComputeCapacityStore.resolve(tier, seatTier, variant);
    expect(cap.window5hPc).toBe(pc5h);
    expect(cap.windowWeeklyPc).toBe(pcWeek);
    expect(cap.window5hActiveHours).toBe(h5h);
    expect(cap.windowWeeklyActiveHours).toBe(hWeek);
    expect(cap.pooled).toBe(pooled);
  });
});
