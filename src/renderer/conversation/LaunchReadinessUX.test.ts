import { describe, expect, it } from 'vitest';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { describeLaunchFailure, describeTaskLevelLaunchFailure, evaluateCodingCompletionReadiness } from './LaunchReadinessUX';

const request: ActionRequest = { type: 'runCommand', command: 'npm test', cwd: 'C:/repo' };
const usageFailure: ActionResult = { ok: false, reason: 'usage-restricted', message: 'quota exhausted' };

describe('LaunchReadinessUX', () => {
  it('never overrides the real backend message, and never names an internal runtime', () => {
    const result: ActionResult = {
      ok: false,
      reason: 'entitlement-restricted',
      message: 'This action requires Paw Pro. Your current plan supports investigation, analysis, and planning — upgrade to generate, modify, build, test, and debug code.',
      data: { requiredFeature: 'advancedRuntimes', requiredTier: 'pro' },
    };

    expect(describeLaunchFailure(result, request, 'go')).toEqual({
      title: 'BUILD BLOCKED',
      message: 'This action requires Paw Pro. Your current plan supports investigation, analysis, and planning — upgrade to generate, modify, build, test, and debug code.',
      actions: ['upgrade'],
    });
  });

  it('recommends Pro Max, not Pro, when the real entitlement data says Pro Max is required', () => {
    const result: ActionResult = {
      ok: false,
      reason: 'entitlement-restricted',
      message: 'Autonomous Work requires Paw Pro Max or higher. Upgrade from Settings → Billing to start an autonomous engineering task.',
      data: { requiredFeature: 'autonomousTaskBilling', requiredTier: 'proMax' },
    };

    expect(describeLaunchFailure(result, request, 'go')).toEqual({
      title: 'BUILD BLOCKED',
      message: 'Autonomous Work requires Paw Pro Max or higher. Upgrade from Settings → Billing to start an autonomous engineering task.',
      actions: ['upgradeProMax'],
    });
  });

  it('appends an org-plan note as supporting context only, for a non-personal email domain, never as the primary driver', () => {
    const result: ActionResult = {
      ok: false,
      reason: 'entitlement-restricted',
      message: 'This action requires Paw Pro.',
      data: { requiredFeature: 'advancedRuntimes', requiredTier: 'pro' },
    };

    expect(describeLaunchFailure(result, request, 'go', 'founder@revantaai.com')?.message).toBe(
      "This action requires Paw Pro. If you're part of a team, Paw Team and Paw Enterprise plans include this too and centralize billing for your organization."
    );
    // A personal email domain gets no org note appended.
    expect(describeLaunchFailure(result, request, 'go', 'someone@gmail.com')?.message).toBe('This action requires Paw Pro.');
    // No email available at all gets no org note appended.
    expect(describeLaunchFailure(result, request, 'go', null)?.message).toBe('This action requires Paw Pro.');
  });

  it('falls back to contactAdmin for a team/enterprise-required capability, with no org note (the message already says so)', () => {
    const result: ActionResult = {
      ok: false,
      reason: 'entitlement-restricted',
      message: 'This action requires a Team or Enterprise plan.',
      data: { requiredFeature: 'sharedWorkspaces', requiredTier: 'team' },
    };

    expect(describeLaunchFailure(result, request, 'go', 'founder@revantaai.com')).toEqual({
      title: 'BUILD BLOCKED',
      message: 'This action requires a Team or Enterprise plan.',
      actions: ['contactAdmin'],
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
    expect(describeTaskLevelLaunchFailure('Select a workspace root before running file or code actions.')).toEqual({
      title: 'BUILD BLOCKED',
      message: 'Select a workspace root before running file or code actions.',
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
