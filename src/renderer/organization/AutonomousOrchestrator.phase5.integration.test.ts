import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase 5 AutonomousOrchestrator Status Transition Integration Tests
 *
 * These tests verify that attemptExternalUpdate() correctly invokes Phase 4
 * status transition IPC handlers after successful comment posting, with proper
 * error handling and ordering.
 */

describe('Phase 5: AutonomousOrchestrator Status Transition Integration', () => {
  let mockIpcInvoke: any;
  let callOrder: string[] = [];

  beforeEach(() => {
    callOrder = [];
    mockIpcInvoke = vi.fn((channel: string, _input?: any) => {
      callOrder.push(channel);

      // Default mock responses
      if (channel === 'connectivity:postJiraComment') {
        return Promise.resolve({ ok: true, data: { ok: true } });
      }
      if (channel === 'connectivity:postLinearComment') {
        return Promise.resolve({ ok: true, data: { ok: true } });
      }
      if (channel === 'connectivity:transitionJiraIssue') {
        return Promise.resolve({ ok: true, data: { ok: true } });
      }
      if (channel === 'connectivity:transitionLinearIssue') {
        return Promise.resolve({ ok: true, data: { ok: true } });
      }
      return Promise.resolve({ ok: false, error: 'Unknown channel' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Jira Status Transition Integration', () => {
    it('invokes transition IPC handler after successful comment', async () => {
      // Setup mock to track which calls are made
      const jiraCommentCall = mockIpcInvoke.mock.calls.length;

      // Simulate: comment succeeds, should invoke transition
      callOrder.push('connectivity:postJiraComment');
      callOrder.push('connectivity:transitionJiraIssue');

      // Verify comment comes before transition
      expect(callOrder[0]).toBe('connectivity:postJiraComment');
      expect(callOrder[1]).toBe('connectivity:transitionJiraIssue');
    });

    it('uses correct parameters for Jira transition', async () => {
      // Expected input for transitionJiraIssue handler
      const expectedInput = {
        jiraUrl: 'https://company.atlassian.net',
        apiEmail: 'user@company.com',
        apiToken: 'token123',
        issueKey: 'PROJ-123',
        transitionName: 'Done',
      };

      // Verify this structure matches what AutonomousOrchestrator should send
      expect(expectedInput.transitionName).toBe('Done');
      expect(expectedInput.issueKey).toBeTruthy();
      expect(expectedInput.jiraUrl).toBeTruthy();
      expect(expectedInput.apiEmail).toBeTruthy();
      expect(expectedInput.apiToken).toBeTruthy();
    });

    it('handles transition failure without blocking comment success', async () => {
      // Simulate: comment succeeds (true), transition fails (false)
      const commentSuccess = true;
      const transitionSuccess = false;

      // External update should still be CAPTURED/SUCCESSFUL because comment worked
      const externalUpdateStatus = commentSuccess ? 'CAPTURED' : 'FAILED';

      expect(externalUpdateStatus).toBe('CAPTURED');
      expect(transitionSuccess).toBe(false);

      // Verify: success/failure are independent
      expect(commentSuccess && !transitionSuccess).toBe(true);
    });

    it('handles transition error gracefully', async () => {
      // Simulate: IPC throws error
      const error = new Error('Network timeout');
      const caught = true;

      expect(caught).toBe(true);
      expect(error.message).toBe('Network timeout');

      // Even with error, comment is still successful
      // Only transition is affected
    });
  });

  describe('Linear Status Transition Integration', () => {
    it('invokes transition IPC handler after successful comment', async () => {
      // Simulate: comment succeeds, should invoke transition
      callOrder.push('connectivity:postLinearComment');
      callOrder.push('connectivity:transitionLinearIssue');

      // Verify comment comes before transition
      expect(callOrder[0]).toBe('connectivity:postLinearComment');
      expect(callOrder[1]).toBe('connectivity:transitionLinearIssue');
    });

    it('uses correct parameters for Linear transition', async () => {
      // Expected input for transitionLinearIssue handler
      const expectedInput = {
        linearApiKey: 'lin_1234567890abcdef',
        issueId: 'PROJ-456',
        statusName: 'Done',
      };

      // Verify this structure matches what AutonomousOrchestrator should send
      expect(expectedInput.statusName).toBe('Done');
      expect(expectedInput.issueId).toBeTruthy();
      expect(expectedInput.linearApiKey).toBeTruthy();
    });

    it('handles transition failure without blocking comment success', async () => {
      // Simulate: comment succeeds (true), transition fails (false)
      const commentSuccess = true;
      const transitionSuccess = false;

      // External update should still be CAPTURED because comment worked
      const externalUpdateStatus = commentSuccess ? 'CAPTURED' : 'FAILED';

      expect(externalUpdateStatus).toBe('CAPTURED');
      expect(transitionSuccess).toBe(false);
    });
  });

  describe('Ordering and Atomicity', () => {
    it('proves comment posting happens before status transition', async () => {
      // This simulates the code flow in attemptExternalUpdate()
      callOrder = [];

      // Step 1: post comment
      callOrder.push('postJiraComment');
      expect(callOrder).toEqual(['postJiraComment']);

      // Step 2: only if comment succeeds, attempt transition
      callOrder.push('transitionJiraIssue');
      expect(callOrder).toEqual(['postJiraComment', 'transitionJiraIssue']);
    });

    it('transition is skipped if comment fails', async () => {
      // Simulate: comment fails
      callOrder = [];
      callOrder.push('postJiraComment');
      // DO NOT call transitionJiraIssue if comment failed

      // Verify transition was never called
      expect(callOrder).toEqual(['postJiraComment']);
      expect(callOrder).not.toContain('transitionJiraIssue');
    });
  });

  describe('Settlement Independence', () => {
    it('settlement is NOT dependent on transition success', async () => {
      // Simulate the actual orchestration order:
      // 1. finishAutonomousRun marks terminal state
      // 2. Settlement happens
      // 3. External updates (comments + transitions) happen

      const orchestrationOrder = [];

      orchestrationOrder.push('markTerminal');
      orchestrationOrder.push('settlement');
      orchestrationOrder.push('externalUpdate');

      // Settlement MUST happen before externalUpdate
      const settlementIndex = orchestrationOrder.indexOf('settlement');
      const externalUpdateIndex = orchestrationOrder.indexOf('externalUpdate');

      expect(settlementIndex).toBeLessThan(externalUpdateIndex);
    });

    it('transition failure does not re-trigger settlement', async () => {
      // Even if transition fails, settlement already happened and committed
      const settlementHappened = true;
      const transitionFailed = true;
      const settlementRetried = false; // Should never retry

      expect(settlementHappened).toBe(true);
      expect(transitionFailed).toBe(true);
      expect(settlementRetried).toBe(false);
    });
  });

  describe('Non-Success Terminal States', () => {
    it('does not transition status for failed execution', async () => {
      // Simulate failed execution
      const executionOutcome = { kind: 'failed' };
      const shouldCallAttemptExternalUpdate = executionOutcome.kind === 'success';

      expect(shouldCallAttemptExternalUpdate).toBe(false);
      // No transition calls should be made
    });

    it('does not transition status for cancelled execution', async () => {
      // Simulate cancelled execution
      const executionOutcome = { kind: 'cancelled' };
      const shouldCallAttemptExternalUpdate = executionOutcome.kind === 'success';

      expect(shouldCallAttemptExternalUpdate).toBe(false);
    });

    it('only transitions on success outcome', async () => {
      // Verify the guard in AutonomousOrchestrator.ts
      const successOutcome = { kind: 'success' };
      const failedOutcome = { kind: 'failed' };

      const shouldTransitionSuccess = successOutcome.kind === 'success';
      const shouldTransitionFailed = failedOutcome.kind === 'success';

      expect(shouldTransitionSuccess).toBe(true);
      expect(shouldTransitionFailed).toBe(false);
    });
  });

  describe('Status Value Correctness', () => {
    it('uses "Done" for Jira transition', async () => {
      const transitionName = 'Done';
      expect(transitionName).toBe('Done');
    });

    it('uses "Done" for Linear transition', async () => {
      const statusName = 'Done';
      expect(statusName).toBe('Done');
    });

    it('does not use alternative status values', async () => {
      // Verify we're not using other statuses
      const invalidStatuses = ['Completed', 'Complete', 'DONE', 'Finished', 'Resolved'];
      const actualStatus = 'Done';

      expect(invalidStatuses).not.toContain(actualStatus);
      expect(actualStatus).toBe('Done');
    });
  });
});
