import { entitlementService } from './EntitlementService';
import type { RequirementResolver } from '../runtime/RequirementGate';

/**
 * The 'entitlement' counterpart to CapabilityRequirementResolver — "does the current subscription
 * tier unlock this feature," not "is a connector connected." A plain, deterministic check against
 * EntitlementService; no connector registry, no scope-dependent lookups. A plugin whose
 * Execute-class action isn't already covered by the blanket
 * CODING_EXECUTION_ACTION_TYPES/INFRA_EXECUTION_ACTION_TYPES gate in DesktopExecutionEngine (e.g. a
 * future Intelligence Runtime plugin) declares `{ kind: 'entitlement', feature: '...' }` instead of
 * inventing its own tier check.
 */
export const entitlementRequirementResolver: RequirementResolver<'entitlement'> = {
  kind: 'entitlement',
  async resolve(requirement) {
    if (entitlementService.isFeatureAvailable(requirement.feature)) {
      return { satisfied: true };
    }

    return {
      satisfied: false,
      blockingResult: {
        ok: false,
        reason: 'entitlement-restricted',
        message: requirement.reasonHint ?? 'This action requires a higher Paw plan.',
      },
    };
  },
};
