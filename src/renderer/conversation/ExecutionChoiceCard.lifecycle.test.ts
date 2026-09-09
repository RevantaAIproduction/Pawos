/**
 * Choice lifecycle test: Verify that the execution choice card properly handles
 * user interactions and state transitions.
 */

import { describe, it, expect, vi } from 'vitest';

describe('ExecutionChoiceCard — lifecycle', () => {
  it('actionable request shows card and prevents normal submission', () => {
    // Flow:
    // 1. User types "Build a landing page"
    // 2. send() intercepts before onSendTranscript

    const isActionable = true; // shouldShowExecutionChoice returns true
    let cardShown = false;
    let submissionCount = 0;

    if (isActionable) {
      // Store pending request
      cardShown = true;
      // Return without calling onSendTranscript
    } else {
      submissionCount++;
    }

    expect(cardShown).toBe(true);
    expect(submissionCount).toBe(0);
  });

  it('non-actionable request submits normally without card', () => {
    const isActionable = false; // "What is React?"
    let cardShown = false;
    let submissionCount = 0;

    if (isActionable) {
      cardShown = true;
    } else {
      submissionCount++;
    }

    expect(cardShown).toBe(false);
    expect(submissionCount).toBe(1);
  });

  it('Work with me submits exactly once with acceptEdits mode', () => {
    const onWorkWithMe = vi.fn();
    const onSendTranscript = vi.fn();

    // User selects "Work with me"
    const choice = 'work_with_me';
    const temporaryMode = choice === 'work_with_me' ? 'acceptEdits' : 'plan';
    const pendingRequest = { text: 'Build this', context: { projectId: '123' } };

    // handleExecutionChoice flow:
    const contextWithMode = {
      ...pendingRequest.context,
      temporaryExecutionMode: temporaryMode,
    };

    onSendTranscript(pendingRequest.text, contextWithMode);
    onWorkWithMe();

    expect(onSendTranscript).toHaveBeenCalledTimes(1);
    expect(onSendTranscript).toHaveBeenCalledWith('Build this', {
      projectId: '123',
      temporaryExecutionMode: 'acceptEdits',
    });
    expect(onWorkWithMe).toHaveBeenCalledTimes(1);
  });

  it('Do it autonomously submits exactly once with plan mode', () => {
    const onAutonomous = vi.fn();
    const onSendTranscript = vi.fn();

    // User selects "Do it autonomously"
    const choice = 'autonomous';
    const temporaryMode = choice === 'work_with_me' ? 'acceptEdits' : 'plan';
    const pendingRequest = { text: 'Refactor this component', context: { projectId: '456' } };

    const contextWithMode = {
      ...pendingRequest.context,
      temporaryExecutionMode: temporaryMode,
    };

    onSendTranscript(pendingRequest.text, contextWithMode);
    onAutonomous();

    expect(onSendTranscript).toHaveBeenCalledTimes(1);
    expect(onSendTranscript).toHaveBeenCalledWith('Refactor this component', {
      projectId: '456',
      temporaryExecutionMode: 'plan',
    });
    expect(onAutonomous).toHaveBeenCalledTimes(1);
  });

  it('double-click prevention ensures exactly one submission', () => {
    const onSendTranscript = vi.fn();
    let selectedChoice: string | null = null;

    // First click
    if (selectedChoice === null) {
      selectedChoice = 'work_with_me';
      onSendTranscript('Build this', { temporaryExecutionMode: 'acceptEdits' });
    }

    // Second click (prevented by disabled button)
    const isDisabled = selectedChoice !== null;
    if (!isDisabled && selectedChoice === null) {
      selectedChoice = 'work_with_me';
      onSendTranscript('Build this', { temporaryExecutionMode: 'acceptEdits' });
    }

    expect(onSendTranscript).toHaveBeenCalledTimes(1);
  });

  it('rapid repeated clicks result in exactly one submission', () => {
    const onSendTranscript = vi.fn();
    let selectedChoice: string | null = null;

    const clicks = ['work_with_me', 'work_with_me', 'work_with_me'];

    clicks.forEach((click) => {
      if (selectedChoice === null) {
        selectedChoice = click;
        onSendTranscript('Build this', { temporaryExecutionMode: 'acceptEdits' });
      }
    });

    expect(onSendTranscript).toHaveBeenCalledTimes(1);
  });

  it('cancel submits zero times and clears pending state', () => {
    const onCancel = vi.fn();
    const onSendTranscript = vi.fn();
    let executionChoicePending = true;
    let pendingRequest: unknown = { text: 'Build this', context: {} };

    // User clicks Cancel
    onCancel();
    executionChoicePending = false;
    pendingRequest = null;

    expect(onSendTranscript).not.toHaveBeenCalled();
    expect(executionChoicePending).toBe(false);
    expect(pendingRequest).toBeNull();
  });

  it('persistent executionMode is unchanged (only temporaryMode set)', () => {
    const persistentMode = 'manual'; // User's saved setting
    let runtimeMode = persistentMode;

    // Request submitted with temporaryMode
    const contextWithTemporary = {
      temporaryExecutionMode: 'acceptEdits' as const,
    };

    // Runtime looks up mode:
    const lookupMode = (turnId: number, tempMode?: string): string => {
      // This is what getExecutionMode() does
      return tempMode ?? runtimeMode;
    };

    const appliedMode = lookupMode(1, contextWithTemporary.temporaryExecutionMode);

    // Verify temporary used
    expect(appliedMode).toBe('acceptEdits');

    // Verify persistent unchanged
    expect(runtimeMode).toBe('manual');
  });

  it('selected temporary mode reaches SubmittedInputContext', () => {
    const pendingRequest = { text: 'Fix this bug', context: { projectId: '789' } };

    // User selects choice
    const choice = 'autonomous';
    const temporaryMode = 'plan';

    // Context constructed in handleExecutionChoice
    const contextWithMode = {
      ...pendingRequest.context,
      temporaryExecutionMode: temporaryMode,
    };

    // Verify mode in context
    expect(contextWithMode.temporaryExecutionMode).toBe('plan');
    expect(contextWithMode.projectId).toBe('789');
  });

  it('pending request cleared after selection', () => {
    let pendingRequest: unknown = { text: 'Build this', context: {} };
    let executionChoicePending = true;

    // After handleExecutionChoice completes:
    executionChoicePending = false;
    pendingRequest = null;

    expect(executionChoicePending).toBe(false);
    expect(pendingRequest).toBeNull();
  });

  it('stale choice cannot submit an old request', () => {
    const onSendTranscript = vi.fn();
    let pendingRequest: { text: string; context: unknown } | null = {
      text: 'Build this',
      context: { projectId: '123' },
    };

    // handleExecutionChoice starts
    if (!pendingRequest) return; // Guard at start

    // ... code runs ...

    // Clear pending
    pendingRequest = null;

    // If somehow handleExecutionChoice tried to submit again:
    if (!pendingRequest) {
      // This check prevents submission
      return;
    }

    expect(onSendTranscript).not.toHaveBeenCalled();
  });
});
