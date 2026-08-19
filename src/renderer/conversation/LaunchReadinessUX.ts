import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { FeatureId, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { isExecutionClassification, type CodingRequestClassification } from '../../shared/actions/RequestClassification';
import { isPersonalEmailDomain } from '../../shared/organization/PersonalEmailDomains';

export type FailureAction = 'upgrade' | 'buyCompute' | 'upgradeProMax' | 'buyTicketBalance' | 'contactAdmin' | 'retry' | 'none';

export type FailurePresentation = {
  title: string;
  message: string;
  actions: FailureAction[];
};

export type TaskCompletionReadiness =
  | { status: 'completed'; message: 'Verification passed.' }
  | { status: 'incomplete'; reason: string; evidence: string[] };

function isOrganizationRequest(request: ActionRequest): boolean {
  return Boolean(request.scope?.organizationId);
}

/** The real, entitlement-driven data an 'entitlement-restricted' ActionResult carries — attached
 *  at the point of failure by the runtime that actually knows which FeatureId/tier gates the
 *  attempted capability (EntitlementService.findMinimumTierForFeature), never guessed here. */
type EntitlementBlockData = { requiredFeature?: FeatureId; requiredTier?: SubscriptionTierId | null };

function readEntitlementBlockData(data: unknown): EntitlementBlockData {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  return {
    requiredFeature: typeof d.requiredFeature === 'string' ? (d.requiredFeature as FeatureId) : undefined,
    requiredTier: typeof d.requiredTier === 'string' ? (d.requiredTier as SubscriptionTierId) : undefined,
  };
}

/** Which real upgrade action to offer for a genuinely-blocked capability — derived from the real
 *  minimum required tier (never a fixed per-branch guess), reusing the same FailureAction pills the
 *  UI already renders for Paw Compute exhaustion. Org-scoped accounts always go through their admin
 *  regardless of which tier the capability requires. */
function actionsForRequiredTier(requiredTier: SubscriptionTierId | null | undefined, isOrgContext: boolean): FailureAction[] {
  if (isOrgContext) return ['contactAdmin'];
  if (requiredTier === 'team' || requiredTier === 'enterprise') return ['contactAdmin'];
  if (requiredTier === 'proMax') return ['upgradeProMax'];
  return ['upgrade'];
}

/** Supporting context only, per product rule — never the primary driver of which tier gets
 *  recommended (that's always the real requiredTier above). Only surfaced for an account whose
 *  email domain looks like an organization's (reusing the same personal-domain check already used
 *  to gate Team/Enterprise org creation), and only when the capability itself doesn't already
 *  require Team/Enterprise (in which case the base message already says so). */
function organizationPlanNote(accountEmail: string | null | undefined, requiredTier: SubscriptionTierId | null | undefined): string | null {
  if (!accountEmail || requiredTier === 'team' || requiredTier === 'enterprise') return null;
  const domain = accountEmail.split('@')[1];
  if (!domain || isPersonalEmailDomain(domain)) return null;
  return "If you're part of a team, Paw Team and Paw Enterprise plans include this too and centralize billing for your organization.";
}

export function describeTaskLevelLaunchFailure(finalReport?: string): FailurePresentation | null {
  if (!finalReport) return null;
  if (/select a workspace root before running (file or code actions|coding runtime operations)/i.test(finalReport)) {
    return {
      title: 'BUILD BLOCKED',
      message: 'Select a workspace root before running file or code actions.',
      actions: ['none'],
    };
  }
  return null;
}

export function describeLaunchFailure(
  result: ActionResult,
  request: ActionRequest,
  tier: SubscriptionTierId | null,
  accountEmail?: string | null
): FailurePresentation | null {
  if (result.ok) return null;

  if (result.reason === 'usage-restricted') {
    if (isOrganizationRequest(request) || tier === 'team' || tier === 'enterprise') {
      return {
        title: 'BUILD STOPPED',
        message: 'Paw Compute limit reached for your organization. Contact your administrator before continuing execution.',
        actions: ['contactAdmin'],
      };
    }
    if (tier === 'proMax') {
      return { title: 'BUILD STOPPED', message: 'Paw Compute limit reached. Buy Paw Compute to continue this runtime task.', actions: ['buyCompute'] };
    }
    if (tier === 'pro') {
      return {
        title: 'BUILD STOPPED',
        message: 'Paw Compute limit reached. Buy Paw Compute to continue, or upgrade to Pro Max for a larger monthly allowance.',
        actions: ['buyCompute', 'upgradeProMax'],
      };
    }
    return { title: 'BUILD STOPPED', message: 'Paw Compute limit reached. Upgrade to continue with paid runtime execution.', actions: ['upgrade'] };
  }

  if (result.reason === 'entitlement-restricted') {
    const blockData = readEntitlementBlockData((result as { data?: unknown }).data);
    const isOrgContext = isOrganizationRequest(request) || tier === 'team' || tier === 'enterprise';
    // Always prefer the real message the blocking runtime already produced — it already describes
    // the actual capability in plain language. Never a hardcoded per-tier string here that could
    // silently disagree with (or overwrite) what the runtime that actually resolved the block knows.
    const baseMessage = result.message ?? 'This action requires a plan that supports it.';
    const orgNote = isOrgContext ? null : organizationPlanNote(accountEmail, blockData.requiredTier);
    return {
      title: 'BUILD BLOCKED',
      message: orgNote ? `${baseMessage} ${orgNote}` : baseMessage,
      actions: actionsForRequiredTier(blockData.requiredTier, isOrgContext),
    };
  }

  if (result.reason === 'balance-restricted') {
    // Ticket Balance is a prepaid dollar balance, never gated by tier (the tier check already
    // passed to get here) — an org-scoped account still gets 'contactAdmin' since only an admin
    // can top up the organization's shared balance, same discipline as the usage-restricted org
    // branch above, but the individual case always offers buyTicketBalance, never a plain retry.
    return {
      title: 'BUILD BLOCKED',
      message: result.message ?? 'Your Ticket Balance is too low to start this autonomous task.',
      actions: isOrganizationRequest(request) ? ['contactAdmin'] : ['buyTicketBalance'],
    };
  }

  if (result.reason === 'security-restricted') {
    return {
      title: 'BUILD STOPPED',
      message: result.message ?? 'This action tried to operate outside the selected workspace boundary.',
      actions: ['none'],
    };
  }

  if (result.reason === 'requires-confirmation') return null;

  return {
    title: 'BUILD STOPPED',
    message: result.message ?? 'The runtime reported a failure. Review the command output or retry the step.',
    actions: ['retry'],
  };
}

export function evaluateCodingCompletionReadiness(input: {
  classification: CodingRequestClassification;
  hasFileActivity: boolean;
  hasCommandActivity: boolean;
  hasBuildResult: boolean;
  buildPassed?: boolean;
  hasTestResult: boolean;
  testsPassed?: boolean;
  hasVisualVerification: boolean;
  visualVerificationPassed?: boolean;
  hasFailures: boolean;
}): TaskCompletionReadiness {
  if (!isExecutionClassification(input.classification)) {
    return { status: 'completed', message: 'Verification passed.' };
  }

  const evidence: string[] = [];
  if (input.hasFailures) evidence.push('At least one runtime action failed.');
  if (!input.hasFileActivity && !input.hasCommandActivity) evidence.push('No file or command activity was recorded for this execution task.');
  if (input.hasBuildResult && !input.buildPassed) evidence.push('Build verification failed.');
  if (input.hasTestResult && !input.testsPassed) evidence.push('Test verification failed.');
  if (input.hasVisualVerification && !input.visualVerificationPassed) evidence.push('Visual verification found issues.');

  if (evidence.length > 0) return { status: 'incomplete', reason: 'Required verification has not passed.', evidence };
  return { status: 'completed', message: 'Verification passed.' };
}
