import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';

/**
 * Proves the trusted entitlement gate at the ONE real entry point that can initiate Autonomous Work
 * ('startAutonomousEngineeringTask') — a Pro (or Go) caller invoking withAutonomousTaskBilling's
 * returned function directly (bypassing any renderer button entirely) is still rejected, before any
 * ticket-balance read or Supabase run creation. Also covers the Autonomous Work hardening pass: the
 * connector-connected gate for tracker-sourced tickets, duplicate-run handling, and evidence-based
 * PR verification at completion. Mirrors the exact `vi.mock('../services/ipc/ipcBridge', ...)`
 * pattern already established in OrganizationUsageBridge.test.ts.
 */
const mocks = vi.hoisted(() => ({
  entitlementIsFeatureAvailable: vi.fn(),
  entitlementGetFeatureTierRequirements: vi.fn(),
  connectivityGetStatus: vi.fn(),
  connectivityVerifyPullRequestExists: vi.fn(),
  getTicketBalance: vi.fn(),
  startRun: vi.fn(),
  completeRun: vi.fn(),
  markTerminal: vi.fn(),
  getUser: vi.fn(),
  orchestrateAutonomousRun: vi.fn(),
}));

vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({
    entitlementIsFeatureAvailable: mocks.entitlementIsFeatureAvailable,
    entitlementGetFeatureTierRequirements: mocks.entitlementGetFeatureTierRequirements,
    connectivityGetStatus: mocks.connectivityGetStatus,
    connectivityVerifyPullRequestExists: mocks.connectivityVerifyPullRequestExists,
  }),
}));

vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('./AutonomousTaskBillingService', () => ({
  autonomousTaskBillingService: {
    getTicketBalance: mocks.getTicketBalance,
    startRun: mocks.startRun,
    completeRun: mocks.completeRun,
    markTerminal: mocks.markTerminal,
  },
}));

vi.mock('./AutonomousOrchestrator', () => ({
  orchestrateAutonomousRun: mocks.orchestrateAutonomousRun,
}));

import { withAutonomousTaskBilling } from './AutonomousTaskBillingGate';

const startRequest: ActionRequest = { type: 'startAutonomousEngineeringTask', ticketId: 'TICKET-1', repository: 'org/repo' };
const fallbackExecute = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));

function fakeRun(overrides: Partial<{ id: string; startedAt: string }> = {}) {
  return { id: overrides.id ?? 'run-1', startedAt: overrides.startedAt ?? new Date().toISOString() } as any;
}

describe('withAutonomousTaskBilling — Autonomous Work entitlement gate', () => {
  beforeEach(() => {
    mocks.entitlementIsFeatureAvailable.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockResolvedValue({ autonomousTaskBilling: 'proMax' });
    mocks.connectivityGetStatus.mockReset();
    mocks.connectivityVerifyPullRequestExists.mockReset();
    mocks.getTicketBalance.mockReset();
    mocks.startRun.mockReset();
    mocks.completeRun.mockReset();
    mocks.markTerminal.mockReset();
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    fallbackExecute.mockClear();
  });

  it('Go/Pro (autonomousTaskBilling unavailable): rejected before any ticket-balance read or run creation', async () => {
    mocks.entitlementIsFeatureAvailable.mockResolvedValue(false);
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated(startRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('entitlement-restricted');
    }
    expect(mocks.getTicketBalance).not.toHaveBeenCalled();
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it('Pro Max/Team/Enterprise (autonomousTaskBilling available) with sufficient balance: the real run starts', async () => {
    mocks.entitlementIsFeatureAvailable.mockResolvedValue(true);
    mocks.getTicketBalance.mockResolvedValue({ organizationId: null, balanceUsd: 100, ticketsUsedCount: 0, updatedAt: new Date().toISOString() });
    mocks.startRun.mockResolvedValue({ run: fakeRun(), alreadyActive: false });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated(startRequest);

    expect(result.ok).toBe(true);
    expect(mocks.startRun).toHaveBeenCalledTimes(1);
  });

  it('re-checks entitlement on every call — never caches a stale "allowed" result across two starts', async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);

    mocks.entitlementIsFeatureAvailable.mockResolvedValueOnce(true);
    mocks.getTicketBalance.mockResolvedValue({ organizationId: null, balanceUsd: 100, ticketsUsedCount: 0, updatedAt: new Date().toISOString() });
    mocks.startRun.mockResolvedValue({ run: fakeRun(), alreadyActive: false });
    const first = await gated(startRequest);
    expect(first.ok).toBe(true);

    // Simulate a downgrade between the two calls — the account is no longer entitled.
    mocks.entitlementIsFeatureAvailable.mockResolvedValueOnce(false);
    const second = await gated(startRequest);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('entitlement-restricted');
    }
    expect(mocks.entitlementIsFeatureAvailable).toHaveBeenCalledTimes(2);
  });

  it('other action types (not Autonomous Work) still fall through to the wrapped executeAction unaffected', async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);
    const request: ActionRequest = { type: 'openUrl', url: 'https://example.com' };

    const result = await gated(request);

    expect(fallbackExecute).toHaveBeenCalledWith(request);
    expect(mocks.entitlementIsFeatureAvailable).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe('withAutonomousTaskBilling — connector-connected gate for tracker-sourced tickets', () => {
  beforeEach(() => {
    mocks.entitlementIsFeatureAvailable.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockResolvedValue({ autonomousTaskBilling: 'proMax' });
    mocks.connectivityGetStatus.mockReset();
    mocks.getTicketBalance.mockReset();
    mocks.startRun.mockReset();
    mocks.getUser.mockReset();
    mocks.entitlementIsFeatureAvailable.mockResolvedValue(true);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.getTicketBalance.mockResolvedValue({ organizationId: null, balanceUsd: 100, ticketsUsedCount: 0, updatedAt: new Date().toISOString() });
    mocks.startRun.mockResolvedValue({ run: fakeRun(), alreadyActive: false });
  });

  it('Jira-sourced ticket, Jira not connected — BLOCKED before any ticket-balance read or run creation', async () => {
    mocks.connectivityGetStatus.mockResolvedValue({ ok: true, data: { state: 'disconnected', capabilities: [] } });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'JIRA-1', ticketSource: 'jira' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Jira is not connected');
    }
    expect(mocks.getTicketBalance).not.toHaveBeenCalled();
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it('Jira-sourced ticket, Jira connected — proceeds to start the run', async () => {
    mocks.connectivityGetStatus.mockResolvedValue({ ok: true, data: { state: 'connected', capabilities: ['readTickets'] } });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'JIRA-1', ticketSource: 'jira' });

    expect(result.ok).toBe(true);
    expect(mocks.startRun).toHaveBeenCalledTimes(1);
  });

  it('Linear-sourced ticket, Linear expired — BLOCKED (only a real "connected"/"syncing" state passes)', async () => {
    mocks.connectivityGetStatus.mockResolvedValue({ ok: true, data: { state: 'expired', capabilities: [] } });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'LIN-1', ticketSource: 'linear' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Linear is not connected');
    }
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it('ticketless run (no ticketSource) never checks any connector', async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({ type: 'startAutonomousEngineeringTask', repository: 'org/repo' });

    expect(result.ok).toBe(true);
    expect(mocks.connectivityGetStatus).not.toHaveBeenCalled();
    expect(mocks.startRun).toHaveBeenCalledTimes(1);
  });

  it("azureDevOps ticket source has no real connector — the gate honestly skips rather than blocking on a connector that doesn't exist", async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'AB#1', ticketSource: 'azureDevOps' });

    expect(result.ok).toBe(true);
    expect(mocks.connectivityGetStatus).not.toHaveBeenCalled();
  });
});

describe('withAutonomousTaskBilling — duplicate-run prevention', () => {
  beforeEach(() => {
    mocks.entitlementIsFeatureAvailable.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockResolvedValue({ autonomousTaskBilling: 'proMax' });
    mocks.getTicketBalance.mockReset();
    mocks.startRun.mockReset();
    mocks.entitlementIsFeatureAvailable.mockResolvedValue(true);
    mocks.getTicketBalance.mockResolvedValue({ organizationId: null, balanceUsd: 100, ticketsUsedCount: 0, updatedAt: new Date().toISOString() });
  });

  it('an already-active run for this ticket is returned instead of silently starting a duplicate', async () => {
    const existing = fakeRun({ id: 'run-existing', startedAt: '2026-08-01T00:00:00.000Z' });
    mocks.startRun.mockResolvedValue({ run: existing, alreadyActive: true });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated(startRequest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { runId: string; alreadyActive: boolean; message: string };
      expect(data.runId).toBe('run-existing');
      expect(data.alreadyActive).toBe(true);
      expect(data.message).toContain('already in progress');
    }
  });

  it('a genuinely new run is reported without the alreadyActive flag', async () => {
    mocks.startRun.mockResolvedValue({ run: fakeRun({ id: 'run-fresh' }), alreadyActive: false });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated(startRequest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { runId: string; alreadyActive?: boolean };
      expect(data.runId).toBe('run-fresh');
      expect(data.alreadyActive).toBeUndefined();
    }
  });
});

describe('withAutonomousTaskBilling — Autonomous Orchestration Layer kickoff', () => {
  beforeEach(() => {
    mocks.entitlementIsFeatureAvailable.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockReset();
    mocks.entitlementGetFeatureTierRequirements.mockResolvedValue({ autonomousTaskBilling: 'proMax' });
    mocks.getTicketBalance.mockReset();
    mocks.startRun.mockReset();
    mocks.markTerminal.mockReset();
    mocks.orchestrateAutonomousRun.mockReset();
    mocks.entitlementIsFeatureAvailable.mockResolvedValue(true);
    mocks.getTicketBalance.mockResolvedValue({ organizationId: null, balanceUsd: 100, ticketsUsedCount: 0, updatedAt: new Date().toISOString() });
    mocks.startRun.mockResolvedValue({ run: fakeRun({ id: 'run-orch' }), alreadyActive: false });
    mocks.markTerminal.mockResolvedValue(undefined);
    mocks.orchestrateAutonomousRun.mockResolvedValue({ runId: 'run-orch', outcome: { kind: 'success' }, billingEventId: 'evt-1', externalUpdate: { status: 'NOT_EXECUTED' } });
  });

  it('a real local cwd triggers orchestration with the real run id and ticket context', async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({
      type: 'startAutonomousEngineeringTask',
      ticketId: 'TICKET-9',
      repository: 'org/repo',
      cwd: 'C:/repos/org-repo',
      ticketTitle: 'Fix the bug',
      ticketDescription: 'Steps to reproduce...',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { orchestrated: boolean }).orchestrated).toBe(true);
    }
    // Fire-and-forget: give the microtask queue a tick so the void-called orchestrator actually runs.
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.orchestrateAutonomousRun).toHaveBeenCalledTimes(1);
    expect(mocks.orchestrateAutonomousRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-orch', ticketId: 'TICKET-9', cwd: 'C:/repos/org-repo', ticketTitle: 'Fix the bug', ticketDescription: 'Steps to reproduce...' })
    );
  });

  it('no cwd supplied — orchestration is never kicked off, matching the pre-orchestration behavior exactly', async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'TICKET-9', repository: 'org/repo' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { orchestrated?: boolean }).orchestrated).toBe(false);
    }
    await Promise.resolve();
    expect(mocks.orchestrateAutonomousRun).not.toHaveBeenCalled();
  });

  it('an already-active run never triggers a second orchestration attempt even if cwd is supplied', async () => {
    mocks.startRun.mockResolvedValue({ run: fakeRun({ id: 'run-existing' }), alreadyActive: true });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'TICKET-9', cwd: 'C:/repos/org-repo' });

    await Promise.resolve();
    expect(mocks.orchestrateAutonomousRun).not.toHaveBeenCalled();
  });

  it('an unexpected orchestration exception marks the run terminal-failed rather than leaving it stuck running forever', async () => {
    mocks.orchestrateAutonomousRun.mockRejectedValue(new Error('network exploded'));
    const gated = withAutonomousTaskBilling(fallbackExecute);

    await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'TICKET-9', cwd: 'C:/repos/org-repo' });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.markTerminal).toHaveBeenCalledWith('run-orch', 'failed');
  });
});

describe('withAutonomousTaskBilling — evidence-based completion (PR verification)', () => {
  const completeRequest: ActionRequest = { type: 'completeAutonomousEngineeringTask', runId: 'run-1', prUrl: 'https://github.com/org/repo/pull/42' };

  beforeEach(() => {
    mocks.connectivityVerifyPullRequestExists.mockReset();
    mocks.completeRun.mockReset();
    mocks.completeRun.mockResolvedValue('event-1');
  });

  it('a genuinely verified PR sets prVerified:true on the completion call', async () => {
    mocks.connectivityVerifyPullRequestExists.mockResolvedValue({ ok: true, data: { verified: true, reason: 'Confirmed via GitHub.' } });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated(completeRequest);

    expect(result.ok).toBe(true);
    expect(mocks.connectivityVerifyPullRequestExists).toHaveBeenCalledWith('https://github.com/org/repo/pull/42');
    expect(mocks.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ prVerified: true, ticketVerified: false }));
  });

  it('an unverifiable PR (connector not connected, wrong host, no match) keeps prVerified:false — never fabricated', async () => {
    mocks.connectivityVerifyPullRequestExists.mockResolvedValue({ ok: true, data: { verified: false, reason: 'GitHub is not connected — cannot independently verify this pull request.' } });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    await gated(completeRequest);

    expect(mocks.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ prVerified: false, ticketVerified: false }));
  });

  it('a completion with no prUrl never calls the verification IPC and reports prVerified:false', async () => {
    const gated = withAutonomousTaskBilling(fallbackExecute);

    await gated({ type: 'completeAutonomousEngineeringTask', runId: 'run-1' });

    expect(mocks.connectivityVerifyPullRequestExists).not.toHaveBeenCalled();
    expect(mocks.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ prVerified: false, ticketVerified: false }));
  });

  it('ticketVerified is unconditionally false — no Jira/Linear/GitHub Issues write-back capability exists to genuinely verify against', async () => {
    mocks.connectivityVerifyPullRequestExists.mockResolvedValue({ ok: true, data: { verified: true, reason: 'Confirmed via GitHub.' } });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    await gated(completeRequest);

    const call = mocks.completeRun.mock.calls[0]!;
    expect((call[1] as { ticketVerified: boolean }).ticketVerified).toBe(false);
  });

  it('a failed IPC verification call (result.ok false) degrades to prVerified:false rather than throwing', async () => {
    mocks.connectivityVerifyPullRequestExists.mockResolvedValue({ ok: false, error: 'IPC failure' });
    const gated = withAutonomousTaskBilling(fallbackExecute);

    const result = await gated(completeRequest);

    expect(result.ok).toBe(true);
    expect(mocks.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ prVerified: false }));
  });
});
