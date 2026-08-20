/**
 * WorkspaceRuntime Phase regression tests.
 *
 * Requirements covered:
 *  5 & 6.  Managed Gemini key — no user prompt
 *  7.      Go/Pro: Autonomous Work entitlement gate blocks
 *  8.      Pro Max+: Autonomous Work entitlement gate passes
 *  9.      Insufficient balance blocks work
 * 10.      Background tasks excluded from rolling allowance
 * 11.      Fable excluded from rolling allowance
 *
 * Requirement 12 (rolling limits exact values) is covered in
 * src/main/billing/RollingLimits.test.ts to avoid vi.mock hoisting
 * conflicts with the PawComputeCapacityStore mock used here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Billing separation (requirements 10 & 11) ──────────────────────────────

const usageMocks = vi.hoisted(() => ({
  list: vi.fn(() => [] as { id: string; timestamp: number; normalizedCompute: number; requestType: string; fable: boolean }[]),
}));

vi.mock('../../main/billing/UsageEventStore', () => ({
  usageEventStore: { list: usageMocks.list, append: vi.fn() },
}));

vi.mock('../../main/billing/PawComputeCapacityStore', () => ({
  pawComputeCapacityStore: {
    resolve: vi.fn(() => ({ window5hPc: 400, window7dPc: 1_600, pooled: false })),
    init: vi.fn(),
  },
}));

import { rollingUsageGate } from '../../main/billing/RollingUsageGate';

describe('Billing separation', () => {
  beforeEach(() => { usageMocks.list.mockReturnValue([]); });

  it('requirement 10 — background task records excluded from rolling allowance', () => {
    usageMocks.list.mockReturnValue([
      { id: '1', timestamp: Date.now(), normalizedCompute: 50, requestType: 'backgroundTask', fable: false },
    ]);
    const result = rollingUsageGate.canStartGeneration('pro');
    expect(result.allowed).toBe(true);
    if (result.allowed && !result.pooled) expect(result.usage.usage5h).toBe(0);
  });

  it('requirement 11 — Fable records excluded from rolling allowance', () => {
    usageMocks.list.mockReturnValue([
      { id: '2', timestamp: Date.now(), normalizedCompute: 200, requestType: 'conversationTurn', fable: true },
    ]);
    const result = rollingUsageGate.canStartGeneration('pro');
    expect(result.allowed).toBe(true);
    if (result.allowed && !result.pooled) expect(result.usage.usage5h).toBe(0);
  });

  it('normal conversation turn DOES consume rolling allowance', () => {
    usageMocks.list.mockReturnValue([
      { id: '3', timestamp: Date.now(), normalizedCompute: 100, requestType: 'conversationTurn', fable: false },
    ]);
    const result = rollingUsageGate.canStartGeneration('pro');
    if (result.allowed && !result.pooled) expect(result.usage.usage5h).toBe(100);
  });
});

// ─── Managed Gemini key — no user prompt (requirements 5 & 6) ───────────────

const geminiMocks = vi.hoisted(() => ({
  envGetApiKeys: vi.fn(),
  setApiKey: vi.fn(),
  getApiKey: vi.fn(),
}));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: { envGetApiKeys: geminiMocks.envGetApiKeys },
}));

vi.mock('../ai/AIProviderConfigStore', () => ({
  aiProviderConfigStore: { setApiKey: geminiMocks.setApiKey, getApiKey: geminiMocks.getApiKey },
}));

import { seedManagedGeminiKey } from '../ai/seedManagedGeminiKey';

describe('Managed Gemini key (requirements 5 & 6)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('key seeded from managed .env path, never user input', async () => {
    geminiMocks.envGetApiKeys.mockResolvedValue({ gemini: 'managed-key-xyz' });
    await seedManagedGeminiKey();
    expect(geminiMocks.envGetApiKeys).toHaveBeenCalledOnce();
    expect(geminiMocks.setApiKey).toHaveBeenCalledWith('gemini', 'managed-key-xyz');
  });

  it('IPC failure resolves silently — app mounts, no user prompt', async () => {
    geminiMocks.envGetApiKeys.mockRejectedValue(new Error('IPC failure'));
    await expect(seedManagedGeminiKey()).resolves.toBeUndefined();
    expect(geminiMocks.setApiKey).not.toHaveBeenCalled();
  });

  it('key value is never written to console.log', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    geminiMocks.envGetApiKeys.mockResolvedValue({ gemini: 'managed-key-secret' });
    await seedManagedGeminiKey();
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('managed-key-secret');
    spy.mockRestore();
  });
});

// ─── Autonomous Work tier gate (requirements 7, 8, 9) ───────────────────────

const autonomousMocks = vi.hoisted(() => ({
  entitlementIsFeatureAvailable: vi.fn(),
  entitlementGetFeatureTierRequirements: vi.fn(),
  connectivityGetStatus: vi.fn(),
  getTicketBalance: vi.fn(async () => ({ balanceUsd: 0, ticketsUsedCount: 0 })),
  getTicketUnitPriceUsd: vi.fn(() => 5),
  startRun: vi.fn(),
  orchestrate: vi.fn(async () => ({})),
  getUser: vi.fn(async () => ({ data: { user: { id: 'test-user' } } })),
}));

vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({
    entitlementIsFeatureAvailable: autonomousMocks.entitlementIsFeatureAvailable,
    entitlementGetFeatureTierRequirements: autonomousMocks.entitlementGetFeatureTierRequirements,
    connectivityGetStatus: autonomousMocks.connectivityGetStatus,
  }),
}));

vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: vi.fn(async () => ({
    auth: { getUser: autonomousMocks.getUser },
  })),
}));

vi.mock('../organization/AutonomousTaskBillingService', () => ({
  autonomousTaskBillingService: {
    getTicketBalance: autonomousMocks.getTicketBalance,
    startRun: autonomousMocks.startRun,
  },
}));

vi.mock('../organization/AutonomousOrchestrator', () => ({
  orchestrateAutonomousRun: autonomousMocks.orchestrate,
}));

vi.mock('../../shared/organization/AutonomousTaskBillingTypes', () => ({
  getTicketUnitPriceUsd: autonomousMocks.getTicketUnitPriceUsd,
}));

import { withAutonomousTaskBilling } from '../organization/AutonomousTaskBillingGate';

describe('Autonomous Work tier gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    autonomousMocks.getTicketBalance.mockResolvedValue({ balanceUsd: 0, ticketsUsedCount: 0 });
    autonomousMocks.getTicketUnitPriceUsd.mockReturnValue(5);
  });

  it('requirement 7 — Go/Pro: entitlement gate blocks, message mentions Pro Max', async () => {
    autonomousMocks.entitlementIsFeatureAvailable.mockResolvedValue(false);
    autonomousMocks.entitlementGetFeatureTierRequirements.mockResolvedValue({ autonomousTaskBilling: 'proMax' });

    const execute = withAutonomousTaskBilling(vi.fn(async () => ({ ok: true as const, data: {} })));
    const result = await execute({ type: 'startAutonomousEngineeringTask', ticketId: 't1', organizationId: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('entitlement-restricted');
      expect(result.message).toMatch(/Pro Max/i);
    }
  });

  it('requirement 9 — insufficient balance blocks work with balance-restricted reason', async () => {
    autonomousMocks.entitlementIsFeatureAvailable.mockResolvedValue(true);
    autonomousMocks.getTicketBalance.mockResolvedValue({ balanceUsd: 0, ticketsUsedCount: 0 });
    autonomousMocks.getTicketUnitPriceUsd.mockReturnValue(5);

    const execute = withAutonomousTaskBilling(vi.fn(async () => ({ ok: true as const, data: {} })));
    const result = await execute({ type: 'startAutonomousEngineeringTask', ticketId: 't3', organizationId: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('balance-restricted');
  });

  it('requirement 8 — Pro Max with sufficient balance passes entitlement gate', async () => {
    autonomousMocks.entitlementIsFeatureAvailable.mockResolvedValue(true);
    autonomousMocks.getTicketBalance.mockResolvedValue({ balanceUsd: 30, ticketsUsedCount: 0 });
    autonomousMocks.getTicketUnitPriceUsd.mockReturnValue(5);
    autonomousMocks.startRun.mockResolvedValue({ run: { id: 'run-1', startedAt: new Date().toISOString() }, alreadyActive: false });

    const innerExecute = vi.fn(async () => ({ ok: true as const, data: { runId: 'run-1' } }));
    const execute = withAutonomousTaskBilling(innerExecute);
    const result = await execute({ type: 'startAutonomousEngineeringTask', ticketId: 't2', organizationId: undefined });
    // entitlement + balance both passed — should NOT be entitlement-restricted or balance-restricted
    if (!result.ok) {
      expect(result.reason).not.toBe('entitlement-restricted');
      expect(result.reason).not.toBe('balance-restricted');
    }
  });
});
