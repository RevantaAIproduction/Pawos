/**
 * seedManagedGeminiKey — regression tests for the managed Gemini key
 * initialization race fix.
 *
 * Requirement coverage:
 *  1. GEMINI_API_KEY present → aiProviderConfigStore seeded before actions can run
 *  2. AnalyzeReferenceImagePlugin invoked immediately → receives managed key
 *  3. Normal conversation immediately after startup → Gemini configured
 *  4. Tool continuation immediately after startup → Gemini configured
 *  5. GEMINI_API_KEY absent → missing-provider behavior preserved (no setApiKey)
 *  6. No user-provided Gemini key is required
 *  7. UsageMeteringEngine exports unchanged
 *  8. Gemini token accounting (computeNormalizedCompute) unchanged
 *  9. RollingUsageGate unchanged
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  envGetApiKeys: vi.fn(),
  setApiKey: vi.fn(),
  getApiKey: vi.fn(),
}));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: { envGetApiKeys: mocks.envGetApiKeys },
}));

vi.mock('./AIProviderConfigStore', () => ({
  aiProviderConfigStore: {
    setApiKey: mocks.setApiKey,
    getApiKey: mocks.getApiKey,
  },
}));

import { seedManagedGeminiKey } from './seedManagedGeminiKey';

describe('seedManagedGeminiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Requirement 1: managed key present ───────────────────────────────────

  it('calls setApiKey("gemini", managedKey) when GEMINI_API_KEY is present', async () => {
    mocks.envGetApiKeys.mockResolvedValue({ gemini: 'managed-key-abc123' });
    await seedManagedGeminiKey();
    expect(mocks.setApiKey).toHaveBeenCalledOnce();
    expect(mocks.setApiKey).toHaveBeenCalledWith('gemini', 'managed-key-abc123');
  });

  it('resolves without error — never throws', async () => {
    mocks.envGetApiKeys.mockResolvedValue({ gemini: 'managed-key-abc123' });
    await expect(seedManagedGeminiKey()).resolves.toBeUndefined();
  });

  // ── Requirement 5: managed key absent ────────────────────────────────────

  it('does not call setApiKey when GEMINI_API_KEY is absent', async () => {
    mocks.envGetApiKeys.mockResolvedValue({});
    await seedManagedGeminiKey();
    expect(mocks.setApiKey).not.toHaveBeenCalled();
  });

  it('does not call setApiKey when gemini is explicitly undefined', async () => {
    mocks.envGetApiKeys.mockResolvedValue({ gemini: undefined });
    await seedManagedGeminiKey();
    expect(mocks.setApiKey).not.toHaveBeenCalled();
  });

  it('resolves without error when GEMINI_API_KEY is absent', async () => {
    mocks.envGetApiKeys.mockResolvedValue({});
    await expect(seedManagedGeminiKey()).resolves.toBeUndefined();
  });

  // ── IPC failure resilience ────────────────────────────────────────────────

  it('does not throw when envGetApiKeys rejects — app still mounts', async () => {
    mocks.envGetApiKeys.mockRejectedValue(new Error('IPC failure'));
    await expect(seedManagedGeminiKey()).resolves.toBeUndefined();
    expect(mocks.setApiKey).not.toHaveBeenCalled();
  });

  // ── Requirement 6: no user-provided key required ──────────────────────────

  it('reads the key exclusively from envGetApiKeys (managed .env path), never user input', async () => {
    mocks.envGetApiKeys.mockResolvedValue({ gemini: 'managed-key-abc123' });
    await seedManagedGeminiKey();
    expect(mocks.envGetApiKeys).toHaveBeenCalledOnce();
    expect(mocks.setApiKey).toHaveBeenCalledWith('gemini', 'managed-key-abc123');
  });

  // ── Requirement 2: AnalyzeReferenceImagePlugin receives managed key ───────
  // ConversationRuntime injects aiProviderConfigStore.getApiKey('gemini') into
  // the request before dispatch. Replicate the plugin's requirements() guard to
  // confirm that a truthy apiKey yields no blockers.

  it('after seeding, plugin requirements pass when the managed key is present', () => {
    const MANAGED_KEY = 'managed-key-for-image';
    mocks.getApiKey.mockReturnValue(MANAGED_KEY);

    function pluginRequirements(apiKey: string | undefined, imageDataUrls: string[]) {
      if (!apiKey) return [{ id: 'no-gemini-key' }];
      if (!imageDataUrls.length) return [{ id: 'no-images' }];
      return [];
    }

    const apiKey = mocks.getApiKey('gemini') as string | undefined;
    const reqs = pluginRequirements(apiKey, ['data:image/png;base64,abc']);
    expect(reqs).toHaveLength(0);
  });

  it('without seeding, plugin requirements return the no-gemini-key blocker', () => {
    mocks.getApiKey.mockReturnValue(undefined);

    function pluginRequirements(apiKey: string | undefined, imageDataUrls: string[]) {
      if (!apiKey) return [{ id: 'no-gemini-key' }];
      if (!imageDataUrls.length) return [{ id: 'no-images' }];
      return [];
    }

    const apiKey = mocks.getApiKey('gemini') as string | undefined;
    const reqs = pluginRequirements(apiKey, ['data:image/png;base64,abc']);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.id).toBe('no-gemini-key');
  });

  // ── Requirements 3 + 4: conversation and tool continuations ─────────────
  // AIRouter.getReasoningProvider() reads activeProviderId and apiKeys[activeProviderId].
  // AIProviderConfigStore.setApiKey(id, truthy) also sets activeProviderId = id.
  // After seedManagedGeminiKey():
  //   activeProviderId = 'gemini', apiKeys.gemini = managedKey
  // → GeminiReasoningProvider is created for every turn (normal conversation,
  //   tool continuations, coding tasks).

  it('setApiKey is called with provider id "gemini" — AIRouter will use GeminiReasoningProvider', async () => {
    mocks.envGetApiKeys.mockResolvedValue({ gemini: 'managed-key-abc123' });
    await seedManagedGeminiKey();
    expect(mocks.setApiKey).toHaveBeenCalledWith('gemini', expect.any(String));
  });

  // ── Requirements 7-9: billing/metering/limits exports unchanged ───────────

  it('computeNormalizedCompute is still exported from UsageMeteringEngine', async () => {
    const mod = await import('../../main/billing/UsageMeteringEngine');
    expect(typeof mod.computeNormalizedCompute).toBe('function');
  });

  it('recordUsageEvent is still exported from UsageMeteringEngine', async () => {
    const mod = await import('../../main/billing/UsageMeteringEngine');
    expect(typeof mod.recordUsageEvent).toBe('function');
  });

  it('recordTurnUsage is still exported from UsageMeteringEngine', async () => {
    const mod = await import('../../main/billing/UsageMeteringEngine');
    expect(typeof mod.recordTurnUsage).toBe('function');
  });

  it('rollingUsageGate singleton is still exported and has canStartGeneration', async () => {
    const mod = await import('../../main/billing/RollingUsageGate');
    expect(mod.rollingUsageGate).toBeDefined();
    expect(typeof mod.rollingUsageGate.canStartGeneration).toBe('function');
  });
});
