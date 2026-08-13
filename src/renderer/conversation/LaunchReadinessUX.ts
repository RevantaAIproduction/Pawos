import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { isExecutionClassification, type CodingRequestClassification } from '../../shared/actions/RequestClassification';

export type FailureAction = 'upgrade' | 'buyCompute' | 'upgradeProMax' | 'contactAdmin' | 'retry' | 'none';

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

export function describeTaskLevelLaunchFailure(finalReport?: string): FailurePresentation | null {
  if (!finalReport) return null;
  if (/select a workspace root before running coding runtime operations/i.test(finalReport)) {
    return {
      title: 'BUILD BLOCKED',
      message: 'Select a workspace root before running Coding Runtime operations.',
      actions: ['none'],
    };
  }
  return null;
}

export function describeLaunchFailure(result: ActionResult, request: ActionRequest, tier: SubscriptionTierId | null): FailurePresentation | null {
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
    if (tier === 'go') {
      return {
        title: 'BUILD BLOCKED',
        message: 'Paw Go is planning and analysis only. Coding Runtime execution requires Paw Pro or higher.',
        actions: ['upgrade'],
      };
    }
    return {
      title: 'BUILD BLOCKED',
      message: result.message ?? 'This action requires a runtime entitlement that is not enabled for this account.',
      actions: tier === 'team' || tier === 'enterprise' || isOrganizationRequest(request) ? ['contactAdmin'] : ['upgrade'],
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
