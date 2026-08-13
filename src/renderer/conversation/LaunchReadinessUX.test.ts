import { describe, expect, it } from 'vitest';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { describeLaunchFailure, describeTaskLevelLaunchFailure, evaluateCodingCompletionReadiness } from './LaunchReadinessUX';

const request: ActionRequest = { type: 'runCommand', command: 'npm test', cwd: 'C:/repo' };
const usageFailure: ActionResult = { ok: false, reason: 'usage-restricted', message: 'quota exhausted' };

describe('LaunchReadinessUX', () => {
  it('shows the required Go Coding Runtime entitlement message instead of a generic failure', () => {
    const result: ActionResult = { ok: false, reason: 'entitlement-restricted', message: 'Coding Runtime is not enabled.' };

    expect(describeLaunchFailure(result, request, 'go')).toEqual({
      title: 'BUILD BLOCKED',
      message: 'Paw Go is planning and analysis only. Coding Runtime execution requires Paw Pro or higher.',
      actions: ['upgrade'],
    });
  });

  it('renders tier-specific Paw Compute exhaustion actions', () => {
    expect(describeLaunchFailure(usageFailure, request, 'pro')?.actions).toEqual(['buyCompute', 'upgradeProMax']);
    expect(describeLaunchFailure(usageFailure, request, 'proMax')?.actions).toEqual(['buyCompute']);
    expect(describeLaunchFailure(usageFailure, { ...request, scope: { organizationId: 'org-1', userId: 'user-1' } }, 'enterprise')?.actions).toEqual(['contactAdmin']);
  });

  it('does not turn workspace security failures into upgrade or retry prompts', () => {
    const result: ActionResult = { ok: false, reason: 'security-restricted', message: 'Path escapes selected workspace.' };

    expect(describeLaunchFailure(result, request, 'pro')).toEqual({
      title: 'BUILD STOPPED',
      message: 'Path escapes selected workspace.',
      actions: ['none'],
    });
  });

  it('shows command failures as a stopped build with retry guidance', () => {
    const result: ActionResult = { ok: false, reason: 'failed', message: 'npm test exited with code 1.' };

    expect(describeLaunchFailure(result, request, 'pro')).toEqual({
      title: 'BUILD STOPPED',
      message: 'npm test exited with code 1.',
      actions: ['retry'],
    });
  });

  it('shows missing workspace root as a blocked build even when execution never reaches a plugin failure', () => {
    expect(describeTaskLevelLaunchFailure('Select a workspace root before running Coding Runtime operations.')).toEqual({
      title: 'BUILD BLOCKED',
      message: 'Select a workspace root before running Coding Runtime operations.',
      actions: ['none'],
    });
  });

  it('prevents completion when required verification failed', () => {
    expect(
      evaluateCodingCompletionReadiness({
        classification: 'EXECUTE',
        hasFileActivity: true,
        hasCommandActivity: true,
        hasBuildResult: true,
        buildPassed: false,
        hasTestResult: true,
        testsPassed: true,
        hasVisualVerification: true,
        visualVerificationPassed: false,
        hasFailures: false,
      })
    ).toEqual({
      status: 'incomplete',
      reason: 'Required verification has not passed.',
      evidence: ['Build verification failed.', 'Visual verification found issues.'],
    });
  });

  it('allows non-execution planning/guidance completion without runtime verification', () => {
    expect(
      evaluateCodingCompletionReadiness({
        classification: 'PLAN_ONLY',
        hasFileActivity: false,
        hasCommandActivity: false,
        hasBuildResult: false,
        hasTestResult: false,
        hasVisualVerification: false,
        hasFailures: false,
      })
    ).toEqual({ status: 'completed', message: 'Verification passed.' });
  });
});
