import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-coding-mode-test-'));

vi.mock('electron', () => ({ app: { getPath: () => tmpDir } }));

vi.mock('../../billing/EntitlementService', () => ({
  entitlementService: {
    getEntitlements: vi.fn(() => ({ tier: 'go', features: [] })),
    isFeatureAvailable: vi.fn(() => false),
  },
}));

import { getCodingModePlugin } from './GetCodingModePlugin';
import { setCodingModePlugin } from './SetCodingModePlugin';
import { codingModeStore } from '../CodingModeStore';

beforeEach(() => {
  // Re-initialize from temp dir so each test starts with a clean slate
  codingModeStore.init();
});

describe('GetCodingModePlugin', () => {
  it('canHandle only getCodingMode', () => {
    expect(getCodingModePlugin.canHandle({ type: 'getCodingMode' })).toBe(true);
    expect(getCodingModePlugin.canHandle({ type: 'setCodingMode', mode: 'pro' })).toBe(false);
  });

  it('returns the current mode in the result data', async () => {
    const result = await getCodingModePlugin.execute();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { preferences: { mode: string } };
    expect(data.preferences.mode).toBe('go');
  });

  it('describeDone reflects go mode when mode is go', async () => {
    const req = { type: 'getCodingMode' as const };
    const result = await getCodingModePlugin.execute();
    const desc = getCodingModePlugin.describeDone(req, result);
    expect(desc).toMatch(/Paw Go/i);
  });
});

describe('SetCodingModePlugin', () => {
  it('canHandle only setCodingMode', () => {
    expect(setCodingModePlugin.canHandle({ type: 'setCodingMode', mode: 'pro' })).toBe(true);
    expect(setCodingModePlugin.canHandle({ type: 'getCodingMode' })).toBe(false);
  });

  it('switches mode to pro and returns updated preferences', async () => {
    const result = await setCodingModePlugin.execute({ type: 'setCodingMode', mode: 'pro' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { preferences: { mode: string }; executionEntitled: boolean; tier: string };
    expect(data.preferences.mode).toBe('pro');
  });

  it('switches mode back to go', async () => {
    await setCodingModePlugin.execute({ type: 'setCodingMode', mode: 'pro' });
    const result = await setCodingModePlugin.execute({ type: 'setCodingMode', mode: 'go' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { preferences: { mode: string } };
    expect(data.preferences.mode).toBe('go');
  });

  it('persists mode so a subsequent getCodingMode call sees the new value', async () => {
    await setCodingModePlugin.execute({ type: 'setCodingMode', mode: 'pro' });
    const getResult = await getCodingModePlugin.execute();
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    const data = getResult.data as { preferences: { mode: string } };
    expect(data.preferences.mode).toBe('pro');
  });

  it('describeDone for go switch mentions read-only planning', async () => {
    const req = { type: 'setCodingMode' as const, mode: 'go' as const };
    const result = await setCodingModePlugin.execute(req);
    const desc = setCodingModePlugin.describeDone(req, result);
    expect(desc).toMatch(/Paw Go/i);
    expect(desc).toMatch(/planning/i);
  });

  it('describeDone for pro switch without entitlement warns about subscription', async () => {
    const req = { type: 'setCodingMode' as const, mode: 'pro' as const };
    const result = await setCodingModePlugin.execute(req);
    // executionEntitled is false (mocked)
    const desc = setCodingModePlugin.describeDone(req, result);
    expect(desc).toMatch(/subscription|tier|upgrade/i);
  });
});
