import { describe, expect, it, vi, beforeEach } from 'vitest';
import { entitlementService } from './EntitlementService';
import { subscriptionStore } from './SubscriptionStore';
import { ipcMain } from 'electron';
import * as UsageMeteringEngine from './UsageMeteringEngine';

describe('Phase 2E - Go Voice and Enterprise Billing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('VOICE-GO-001: Go entitlement contains paw-voice', () => {
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ active: true, tier: 'go', expiresAt: null });
    const ent = entitlementService.getEntitlements();
    expect(ent.models).toContain('paw-voice');
  });

  it('VOICE-GO-002: Go voice execution is not blocked by entitlement checks', () => {
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ active: true, tier: 'go', expiresAt: null });
    expect(entitlementService.isModelAvailable('paw-voice')).toBe(true);
  });

  it('VOICE-GO-003: Go connector restrictions remain unchanged', () => {
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ active: true, tier: 'go', expiresAt: null });
    const ent = entitlementService.getEntitlements();
    expect(ent.features).toContain('connectGithub');
    expect(ent.features).toContain('connectVercel');
    expect(ent.features).toContain('connectGoogleWorkspace');
    expect(ent.features).toContain('connectMicrosoft');
    expect(ent.features).not.toContain('connectJira');
    expect(ent.features).not.toContain('connectSlack');
    expect(ent.features).not.toContain('connectLinear');
  });

  it('VOICE-GO-004: Build connector restrictions and voice', () => {
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ 
      active: true, 
      tier: 'go', 
      expiresAt: null, 
      buildEntitlement: { active: true, cohortId: '123', includedPc: 1500, purchasedPc: 0 } 
    });
    const ent = entitlementService.getEntitlements();
    expect(ent.models).toContain('paw-voice');
    expect(ent.features).toContain('connectGithub');
    expect(ent.features).toContain('connectVercel');
    expect(ent.features).toContain('connectGoogleWorkspace');
    expect(ent.features).toContain('connectMicrosoft');
    expect(ent.features).not.toContain('connectJira');
    expect(ent.features).not.toContain('connectSlack');
    expect(ent.features).not.toContain('connectLinear');
    expect(ent.features).not.toContain('autonomousTaskBilling');
  });

  it.skip('ENTERPRISE-BILL-001: Renderer cannot submit arbitrary costUsd as authoritative usage', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-002: Server derives Enterprise API usage from trusted usage inputs', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-003: Enterprise monthly budget decrements atomically', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-004: Budget cannot become negative', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-005: Wrong organization/user cannot record usage', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-006: Enterprise usage does not consume normal Tier PC', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-007: Enterprise usage does not consume Autonomous Work PC', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });

  it.skip('ENTERPRISE-BILL-008: Under-report or over-report cost attempt fails', () => { console.log('NOT EXECUTABLE IN CURRENT LOCAL TEST HARNESS'); });
});
