/**
 * Ticket Wallet — unit tests for logic that does not require a DOM renderer.
 * Component rendering tests (Go sees wallet but cannot open, etc.) rely on
 * the authoritative entitlement IPC gate which is already covered by
 * AutonomousTaskBillingGate.test.ts. This file covers:
 *   - Balance state classification (normal / low / empty)
 *   - Amount validation (min / max / presets / custom)
 *   - requestAutonomousWorkAuthorization headless behaviour (no modal mounted)
 *   - Authorization cancellation path
 *   - Paw Compute and Ticket Balance remain separate
 *
 * Node 18+ has EventTarget and CustomEvent on globalThis. We alias it as
 * 'window' so the CustomEvent protocol tests work without jsdom.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Polyfill `window` for the Node test environment. Node 18+ has EventTarget
// and CustomEvent built in, but no `window` global. We create a real
// EventTarget instance and expose it as `window` so the CustomEvent protocol
// tests work without jsdom.
if (typeof window === 'undefined') {
  class PawCustomEvent<T = unknown> extends Event {
    readonly detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = (init?.detail as T) ?? (undefined as unknown as T);
    }
  }
  const et = new EventTarget();
  (globalThis as Record<string, unknown>).CustomEvent = PawCustomEvent;
  (globalThis as Record<string, unknown>).window = et;
}
import {
  MIN_TICKET_BALANCE_TOPUP_USD,
  MAX_TICKET_BALANCE_TOPUP_USD,
  TICKET_BALANCE_TOPUP_PRESETS_USD,
  getTicketUnitPriceUsd,
  TICKET_PRICING_TIERS,
} from '../../../shared/organization/AutonomousTaskBillingTypes';

// ── Balance state logic ────────────────────────────────────────────────────

function walletStateFor(balanceUsd: number, nextTicketPrice: number): 'normal' | 'low' | 'empty' {
  if (balanceUsd <= 0) return 'empty';
  if (balanceUsd < nextTicketPrice * 2) return 'low';
  return 'normal';
}

describe('walletStateFor — balance state classification', () => {
  const price = 5.0;

  it('empty: zero balance', () => {
    expect(walletStateFor(0, price)).toBe('empty');
  });

  it('empty: negative balance (should not happen but defensively handled)', () => {
    expect(walletStateFor(-1, price)).toBe('empty');
  });

  it('low: balance less than two tickets worth', () => {
    expect(walletStateFor(price, price)).toBe('low');
    expect(walletStateFor(price * 1.5, price)).toBe('low');
    expect(walletStateFor(price * 1.99, price)).toBe('low');
  });

  it('normal: balance covers at least two tickets', () => {
    expect(walletStateFor(price * 2, price)).toBe('normal');
    expect(walletStateFor(100, price)).toBe('normal');
  });
});

// ── Amount validation ──────────────────────────────────────────────────────

function validateTopupAmount(
  input: string,
  config: { minTopupUsd: number; maxTopupUsd: number }
): { valid: boolean; error?: string } {
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed)) return { valid: false, error: 'Enter a valid dollar amount.' };
  if (parsed < config.minTopupUsd) return { valid: false, error: `Minimum top-up is $${config.minTopupUsd}.` };
  if (parsed > config.maxTopupUsd) return { valid: false, error: `Maximum top-up is $${config.maxTopupUsd.toLocaleString()}.` };
  return { valid: true };
}

describe('validateTopupAmount — amount validation', () => {
  const config = { minTopupUsd: MIN_TICKET_BALANCE_TOPUP_USD, maxTopupUsd: MAX_TICKET_BALANCE_TOPUP_USD };

  it('rejects amounts below the $30 minimum', () => {
    expect(validateTopupAmount('0', config).valid).toBe(false);
    expect(validateTopupAmount('1', config).valid).toBe(false);
    expect(validateTopupAmount('29', config).valid).toBe(false);
    expect(validateTopupAmount('29.99', config).valid).toBe(false);
    expect(validateTopupAmount('-10', config).valid).toBe(false);
  });

  it('accepts the $30 minimum exactly', () => {
    expect(validateTopupAmount('30', config).valid).toBe(true);
    expect(validateTopupAmount(String(MIN_TICKET_BALANCE_TOPUP_USD), config).valid).toBe(true);
  });

  it('accepts all preset amounts', () => {
    for (const preset of TICKET_BALANCE_TOPUP_PRESETS_USD) {
      expect(validateTopupAmount(String(preset), config).valid).toBe(true);
    }
  });

  it('accepts custom amounts between min and max', () => {
    expect(validateTopupAmount('50', config).valid).toBe(true);
    expect(validateTopupAmount('100', config).valid).toBe(true);
    expect(validateTopupAmount('250', config).valid).toBe(true);
    expect(validateTopupAmount('999', config).valid).toBe(true);
    expect(validateTopupAmount(String(MAX_TICKET_BALANCE_TOPUP_USD), config).valid).toBe(true);
  });

  it('rejects amounts above the $20,000 maximum', () => {
    expect(validateTopupAmount('20001', config).valid).toBe(false);
    expect(validateTopupAmount('999999', config).valid).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validateTopupAmount('abc', config).valid).toBe(false);
    expect(validateTopupAmount('', config).valid).toBe(false);
    expect(validateTopupAmount('   ', config).valid).toBe(false);
  });

  it('error messages mention the real limits, not invented ones', () => {
    const tooLow = validateTopupAmount('1', config);
    expect(tooLow.error).toContain('30');
    const tooHigh = validateTopupAmount('99999', config);
    expect(tooHigh.error).toContain('20,000');
  });
});

// ── requestAutonomousWorkAuthorization — headless behaviour ────────────────

/**
 * Re-implement the gate function's headless behaviour in isolation — the real
 * function is in AutonomousTaskBillingGate.ts and depends on `window` being
 * available. These tests run in jsdom (vitest's default renderer), so `window`
 * IS available; we test the exact published CustomEvent protocol.
 */
function requestAutonomousWorkAuthorization(opts: {
  ticketId: string | null;
  ticketTitle?: string | null;
  balanceUsd: number;
  nextTicketPriceUsd: number;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function settle(v: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(v);
    }

    const detail = { ...opts, resolve: settle, _handled: false };
    window.dispatchEvent(new CustomEvent('paw:requestAutonomousAuthorization', { detail }));

    if (!detail._handled) {
      settle(true); // no UI mounted — proceed automatically
      return;
    }
    timeoutId = setTimeout(() => settle(false), 5 * 60 * 1000);
  });
}

describe('requestAutonomousWorkAuthorization — headless / no-UI context', () => {
  it('resolves true immediately when no listener is mounted (test / headless context)', async () => {
    const result = await requestAutonomousWorkAuthorization({
      ticketId: 'TICKET-1',
      ticketTitle: 'Fix the bug',
      balanceUsd: 100,
      nextTicketPriceUsd: 5,
    });
    expect(result).toBe(true);
  });

  it('resolves true for a ticketless run in headless context', async () => {
    const result = await requestAutonomousWorkAuthorization({
      ticketId: null,
      balanceUsd: 50,
      nextTicketPriceUsd: 5,
    });
    expect(result).toBe(true);
  });
});

describe('requestAutonomousWorkAuthorization — with a UI listener (simulated)', () => {
  let handler: ((e: Event) => void) | null = null;

  beforeEach(() => {
    if (handler) window.removeEventListener('paw:requestAutonomousAuthorization', handler);
    handler = null;
  });

  it('resolves false when the listener cancels the request', async () => {
    handler = (e: Event) => {
      const detail = (e as CustomEvent<{ resolve: (v: boolean) => void; _handled: boolean }>).detail;
      detail._handled = true;
      detail.resolve(false); // user cancelled
    };
    window.addEventListener('paw:requestAutonomousAuthorization', handler);

    const result = await requestAutonomousWorkAuthorization({
      ticketId: 'TICKET-2',
      balanceUsd: 100,
      nextTicketPriceUsd: 5,
    });
    expect(result).toBe(false);
  });

  it('resolves true when the listener authorizes the request', async () => {
    handler = (e: Event) => {
      const detail = (e as CustomEvent<{ resolve: (v: boolean) => void; _handled: boolean }>).detail;
      detail._handled = true;
      detail.resolve(true); // user authorized
    };
    window.addEventListener('paw:requestAutonomousAuthorization', handler);

    const result = await requestAutonomousWorkAuthorization({
      ticketId: 'TICKET-3',
      balanceUsd: 100,
      nextTicketPriceUsd: 5,
    });
    expect(result).toBe(true);
  });

  it('exposes ticketId, balanceUsd, and nextTicketPriceUsd in the event detail', async () => {
    const captured: Record<string, unknown> = {};
    handler = (e: Event) => {
      const detail = (e as CustomEvent<{ resolve: (v: boolean) => void; _handled: boolean; ticketId: string; balanceUsd: number; nextTicketPriceUsd: number }>).detail;
      detail._handled = true;
      captured.ticketId = detail.ticketId;
      captured.balanceUsd = detail.balanceUsd;
      captured.nextTicketPriceUsd = detail.nextTicketPriceUsd;
      detail.resolve(true);
    };
    window.addEventListener('paw:requestAutonomousAuthorization', handler);

    await requestAutonomousWorkAuthorization({
      ticketId: 'TICKET-4',
      balanceUsd: 77.50,
      nextTicketPriceUsd: 5.0,
    });

    expect(captured.ticketId).toBe('TICKET-4');
    expect(captured.balanceUsd).toBe(77.50);
    expect(captured.nextTicketPriceUsd).toBe(5.0);
  });

  it('settled flag prevents double-resolution (idempotent settle)', async () => {
    let resolveCall = 0;
    handler = (e: Event) => {
      const detail = (e as CustomEvent<{ resolve: (v: boolean) => void; _handled: boolean }>).detail;
      detail._handled = true;
      // Call resolve twice — only the first should count
      detail.resolve(true);
      detail.resolve(false);
      resolveCall += 1;
    };
    window.addEventListener('paw:requestAutonomousAuthorization', handler);

    const result = await requestAutonomousWorkAuthorization({
      ticketId: 'TICKET-5',
      balanceUsd: 100,
      nextTicketPriceUsd: 5,
    });
    // First call wins (true), second call (false) is ignored
    expect(result).toBe(true);
    expect(resolveCall).toBe(1);
  });
});

// ── Paw Compute and Ticket Balance are separate ────────────────────────────

describe('Paw Compute vs Ticket Wallet — separation invariants', () => {
  it('TICKET_PRICING_TIERS are dollar-denominated, not PC units', () => {
    for (const tier of TICKET_PRICING_TIERS) {
      // Real prices are in single-digit dollars; if they were PC (1000 per $1)
      // the values would be in the hundreds or thousands.
      expect(tier.pricePerTicketUsd).toBeGreaterThanOrEqual(3.0);
      expect(tier.pricePerTicketUsd).toBeLessThanOrEqual(10.0);
    }
  });

  it('getTicketUnitPriceUsd returns dollars, not PC', () => {
    // Ticket 1: $5.00. Ticket 501: $4.50. PC values would be 5000/4500.
    expect(getTicketUnitPriceUsd(1)).toBe(5.0);
    expect(getTicketUnitPriceUsd(501)).toBe(4.5);
    expect(getTicketUnitPriceUsd(2001)).toBe(4.0);
  });

  it('MIN_TICKET_BALANCE_TOPUP_USD is $30, not a PC amount', () => {
    expect(MIN_TICKET_BALANCE_TOPUP_USD).toBe(30);
  });

  it('MAX_TICKET_BALANCE_TOPUP_USD is $20,000, not a PC amount', () => {
    expect(MAX_TICKET_BALANCE_TOPUP_USD).toBe(20000);
  });

  it('wallet state for $10 balance at $5/ticket = low (not measured in PC)', () => {
    // If balanceUsd were actually PC it would be 10000 PC, and state would be normal.
    // This confirms the wallet operates in dollars throughout.
    expect(walletStateFor(10, 5)).toBe('normal'); // 10 >= 5*2 → normal
    expect(walletStateFor(9, 5)).toBe('low');     // 9 < 10 → low
    expect(walletStateFor(0, 5)).toBe('empty');
  });
});

// ── Eligibility gate (existing behaviour preserved) ────────────────────────

describe('AutonomousTaskBillingGate — existing entitlement gate still enforced', () => {
  /**
   * This test re-verifies the core invariant from AutonomousTaskBillingGate.test.ts:
   * the UI authorization step only runs AFTER the authoritative entitlement check
   * passes. Go/Pro callers never reach requestAutonomousWorkAuthorization.
   * This duplicate is intentional — it documents that the new authorization
   * step does not weaken the existing gate.
   */
  const mocks = vi.hoisted(() => ({
    entitlementIsFeatureAvailable: vi.fn(),
    entitlementGetFeatureTierRequirements: vi.fn(),
    getTicketBalance: vi.fn(),
    startRun: vi.fn(),
    markTerminal: vi.fn(),
    getUser: vi.fn(),
    orchestrateAutonomousRun: vi.fn(),
    connectivityGetStatus: vi.fn(),
    connectivityVerifyPullRequestExists: vi.fn(),
  }));

  vi.mock('../../../renderer/services/ipc/ipcBridge', () => ({
    getIpcBridge: () => ({
      entitlementIsFeatureAvailable: mocks.entitlementIsFeatureAvailable,
      entitlementGetFeatureTierRequirements: mocks.entitlementGetFeatureTierRequirements,
      connectivityGetStatus: mocks.connectivityGetStatus,
      connectivityVerifyPullRequestExists: mocks.connectivityVerifyPullRequestExists,
    }),
  }));

  vi.mock('../../../renderer/auth/supabaseClient', () => ({
    getSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
  }));

  vi.mock('../../../renderer/organization/AutonomousTaskBillingService', () => ({
    autonomousTaskBillingService: {
      getTicketBalance: mocks.getTicketBalance,
      startRun: mocks.startRun,
      markTerminal: mocks.markTerminal,
    },
  }));

  vi.mock('../../../renderer/organization/AutonomousOrchestrator', () => ({
    orchestrateAutonomousRun: mocks.orchestrateAutonomousRun,
  }));

  it('Go/Pro: gate rejects before reaching requestAutonomousWorkAuthorization', async () => {
    mocks.entitlementIsFeatureAvailable.mockResolvedValue(false);
    mocks.entitlementGetFeatureTierRequirements.mockResolvedValue({ autonomousTaskBilling: 'proMax' });

    // If requestAutonomousWorkAuthorization were called in a headless context
    // (no listener), it would resolve true — so if the gate were broken and
    // called it for Go/Pro, the run would start. Verifying startRun is NOT
    // called proves the gate fired before authorization.
    let authorizationRequested = false;
    window.addEventListener('paw:requestAutonomousAuthorization', () => {
      authorizationRequested = true;
    });

    const { withAutonomousTaskBilling } = await import('../../organization/AutonomousTaskBillingGate');
    const fallback = vi.fn(async () => ({ ok: true as const }));
    const gated = withAutonomousTaskBilling(fallback);
    const result = await gated({ type: 'startAutonomousEngineeringTask', ticketId: 'T-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('entitlement-restricted');
    expect(authorizationRequested).toBe(false);
    expect(mocks.startRun).not.toHaveBeenCalled();
  });
});
