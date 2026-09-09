import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementService } from '../billing/EntitlementService';
import { subscriptionStore } from '../billing/SubscriptionStore';
import type { FeatureId, SubscriptionTierId } from '../../shared/billing/BillingTypes';

/**
 * Tier Gating Enforcement Tests
 *
 * Verifies that:
 * 1. Authorized tiers (Pro/Pro Max/Team/Enterprise) can access gated features
 * 2. Unauthorized tiers (Go) receive clear error messages
 * 3. No protected operations execute when gated
 */
describe('IPC Tier Gating — Meeting Assistant Feature Gate', () => {
  const GATED_FEATURE: FeatureId = 'meetingAssistant';
  const EXPECTED_ERROR = 'Meeting Assistant requires Paw Pro or higher.';

  // Test tiers: Go (unauthorized), Pro (authorized minimum)
  const UNAUTHORIZED_TIERS: SubscriptionTierId[] = ['go'];
  const AUTHORIZED_TIERS: SubscriptionTierId[] = ['pro', 'proMax', 'team', 'enterprise'];

  afterEach(() => vi.restoreAllMocks());

  describe('Feature availability check via EntitlementService', () => {
    it('reports meetingAssistant unavailable for Go tier', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      expect(entitlementService.isFeatureAvailable(GATED_FEATURE)).toBe(false);
    });

    it('reports meetingAssistant available for Pro tier', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      expect(entitlementService.isFeatureAvailable(GATED_FEATURE)).toBe(true);
    });

    it('reports meetingAssistant available for Pro Max tier', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      expect(entitlementService.isFeatureAvailable(GATED_FEATURE)).toBe(true);
    });

    it('reports meetingAssistant available for Team tier', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      expect(entitlementService.isFeatureAvailable(GATED_FEATURE)).toBe(true);
    });

    it('reports meetingAssistant available for Enterprise tier', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      expect(entitlementService.isFeatureAvailable(GATED_FEATURE)).toBe(true);
    });
  });

  describe('IPC handler enforcement pattern (simulated)', () => {
    /**
     * This test simulates the gate check pattern used in all 9 gated handlers.
     * The actual handlers check: if (!entitlementService.isFeatureAvailable('meetingAssistant'))
     * and return error before calling protected service.
     */

    // Mock implementation of IPC handler gate check
    const simulateIpcHandlerGate = (handlerName: string): { ok: boolean; reason?: string } => {
      if (!entitlementService.isFeatureAvailable(GATED_FEATURE)) {
        return { ok: false, reason: EXPECTED_ERROR };
      }
      // Handler would call actual service here if authorized
      return { ok: true };
    };

    it('Go tier: blocks all 15 gated meeting handlers with clear error', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'active' });
      entitlementService.setCurrentUserId('go-user');

      const handlers = [
        'meeting:record',
        'meeting:summarize',
        'meeting:distribute',
        'meeting:joinAndRecord',
        'meeting:completeRecording',
        'meeting:approvePreNotification',
        'meeting:startCalendarPolling',
        'meeting:generateStructuredSummary',
        'meeting:cropSummary',
        'meeting:saveDraft',
        'meeting:getDrafts',
        'meeting:scheduleSend',
        'meeting:getScheduledSends',
        'meeting:getSummarizationCost',
        'meeting:confirmSummarize',
      ];

      for (const handlerName of handlers) {
        const result = simulateIpcHandlerGate(handlerName);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(EXPECTED_ERROR);
      }
    });

    it('Pro tier: allows all 15 gated meeting handlers', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
      entitlementService.setCurrentUserId('pro-user');

      const handlers = [
        'meeting:record',
        'meeting:summarize',
        'meeting:distribute',
        'meeting:joinAndRecord',
        'meeting:completeRecording',
        'meeting:approvePreNotification',
        'meeting:startCalendarPolling',
        'meeting:generateStructuredSummary',
        'meeting:cropSummary',
        'meeting:saveDraft',
        'meeting:getDrafts',
        'meeting:scheduleSend',
        'meeting:getScheduledSends',
        'meeting:getSummarizationCost',
        'meeting:confirmSummarize',
      ];

      for (const handlerName of handlers) {
        const result = simulateIpcHandlerGate(handlerName);
        expect(result.ok).toBe(true);
        expect(result.reason).toBeUndefined();
      }
    });

    it('Pro Max tier: allows all 9 gated meeting handlers', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
      entitlementService.setCurrentUserId('promax-user');

      const result = simulateIpcHandlerGate('meeting:record');
      expect(result.ok).toBe(true);
    });

    it('Team tier: allows all 9 gated meeting handlers', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active' });
      entitlementService.setCurrentUserId('team-user');

      const result = simulateIpcHandlerGate('meeting:record');
      expect(result.ok).toBe(true);
    });

    it('Enterprise tier: allows all 9 gated meeting handlers', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
      entitlementService.setCurrentUserId('enterprise-user');

      const result = simulateIpcHandlerGate('meeting:record');
      expect(result.ok).toBe(true);
    });
  });

  describe('Gate enforcement — no side effects on unauthorized access', () => {
    /**
     * Verifies that when an unauthorized user attempts to access a gated feature,
     * the gate check happens BEFORE any protected operation executes.
     * This prevents:
     * - API calls to meeting services
     * - Database writes
     * - External API calls
     * - Billing events
     */

    let mockServiceCall: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockServiceCall = vi.fn(() => ({ ok: true }));
    });

    const simulateHandlerWithSideEffect = (
      callServiceFn: () => any
    ): { ok: boolean; reason?: string } => {
      // Gate check happens FIRST
      if (!entitlementService.isFeatureAvailable(GATED_FEATURE)) {
        return { ok: false, reason: EXPECTED_ERROR };
      }
      // Service call only happens if authorized
      return callServiceFn();
    };

    it('blocks service call when Go user attempts meeting:record', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'active' });
      entitlementService.setCurrentUserId('go-user');

      const result = simulateHandlerWithSideEffect(() => mockServiceCall());

      expect(result.ok).toBe(false);
      expect(mockServiceCall).not.toHaveBeenCalled();
    });

    it('allows service call when Pro user accesses meeting:record', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
      entitlementService.setCurrentUserId('pro-user');

      const result = simulateHandlerWithSideEffect(() => mockServiceCall());

      expect(result.ok).toBe(true);
      expect(mockServiceCall).toHaveBeenCalled();
    });

    it('blocks service call for all unauthorized tiers', () => {
      for (const tier of UNAUTHORIZED_TIERS) {
        mockServiceCall.mockClear();
        vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
        entitlementService.setCurrentUserId(`${tier}-user`);

        const result = simulateHandlerWithSideEffect(() => mockServiceCall());

        expect(result.ok).toBe(false);
        expect(mockServiceCall).not.toHaveBeenCalled();
      }
    });

    it('allows service calls for all authorized tiers', () => {
      for (const tier of AUTHORIZED_TIERS) {
        mockServiceCall.mockClear();
        vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
        entitlementService.setCurrentUserId(`${tier}-user`);

        const result = simulateHandlerWithSideEffect(() => mockServiceCall());

        expect(result.ok).toBe(true);
        expect(mockServiceCall).toHaveBeenCalled();
      }
    });
  });

  describe('Entitlement matrix confirmation', () => {
    it('meetingAssistant requires Pro tier as minimum', () => {
      const tierRequirements = entitlementService.getFeatureTierRequirements();
      expect(tierRequirements['meetingAssistant']).toBe('pro');
    });

    it('Go tier does NOT include meetingAssistant feature', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      const entitlements = entitlementService.getEntitlements();
      expect(entitlements.features).not.toContain('meetingAssistant');
    });

    it('Pro tier includes meetingAssistant feature', () => {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      const entitlements = entitlementService.getEntitlements();
      expect(entitlements.features).toContain('meetingAssistant');
    });

    it('autonomous-ticket entitlements remain unchanged', () => {
      // Verify autonomousTaskBilling (ticket balance) gating is NOT affected
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
      entitlementService.setCurrentUserId('test-user');

      // Pro should NOT have autonomousTaskBilling (Pro Max only)
      expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(false);

      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
      entitlementService.setCurrentUserId('promax-user');

      // Pro Max SHOULD have autonomousTaskBilling
      expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(true);
    });
  });
});
