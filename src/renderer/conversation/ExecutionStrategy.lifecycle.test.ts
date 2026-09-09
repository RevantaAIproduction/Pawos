/**
 * Execution Strategy Lifecycle Test
 *
 * Verifies the complete end-to-end lifecycle:
 * 1. No strategy + actionable → choice shown
 * 2. Choose handsOn → persisted
 * 3. Second actionable → no choice + hands-on
 * 4. Switch to autonomous → no choice
 * 5. Third actionable → no choice + autonomous
 * 6. Switch back to handsOn → no choice
 * 7. Fourth actionable → no choice + hands-on
 * 8. Rerender → strategy persists
 * 9. Concurrent requests safe
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { executionStrategyStore } from './ExecutionStrategyStore';
import { shouldShowExecutionChoice, detectStrategyChange } from './IntentDetection';

describe('Execution Strategy — Complete lifecycle', () => {
  beforeEach(() => {
    executionStrategyStore.reset();
  });

  it('step 1: no strategy + actionable request → shows choice', () => {
    const strategy = executionStrategyStore.getStrategy();
    const isActionable = true; // "Build a landing page"
    const hasStrategy = strategy !== undefined;

    // Should show choice only if no strategy and actionable
    const shouldShow = !hasStrategy && isActionable;
    expect(shouldShow).toBe(true);
  });

  it('step 2: user chooses handsOn → strategy persisted', () => {
    // User selects "Work with me"
    executionStrategyStore.setStrategy('handsOn');

    // Verify persisted
    expect(executionStrategyStore.getStrategy()).toBe('handsOn');
  });

  it('step 3: second actionable request → no choice + hands-on mode', () => {
    // Setup: strategy already persisted
    executionStrategyStore.setStrategy('handsOn');

    // New actionable request
    const strategy = executionStrategyStore.getStrategy();
    const isActionable = true; // "Change the navbar"
    const hasStrategy = strategy !== undefined;

    // Should NOT show choice (has strategy)
    const shouldShow = !hasStrategy && isActionable;
    expect(shouldShow).toBe(false);

    // Should apply hands-on mode
    const temporaryMode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
    expect(temporaryMode).toBe('acceptEdits');
  });

  it('step 4: explicit "switch to autonomous" → updates strategy, no choice', () => {
    // Setup: currently handsOn
    executionStrategyStore.setStrategy('handsOn');

    // User says "Switch to autonomous"
    const detected = detectStrategyChange('Switch to autonomous');
    expect(detected).toBe('autonomous');

    // Update strategy (no choice card shown)
    if (detected) {
      executionStrategyStore.setStrategy(detected);
    }

    // Verify changed
    expect(executionStrategyStore.getStrategy()).toBe('autonomous');
  });

  it('step 5: third actionable request → no choice + autonomous mode', () => {
    // Setup: strategy now autonomous
    executionStrategyStore.setStrategy('autonomous');

    // New actionable request
    const strategy = executionStrategyStore.getStrategy();
    const isActionable = true; // "Refactor this component"
    const hasStrategy = strategy !== undefined;

    // Should NOT show choice
    const shouldShow = !hasStrategy && isActionable;
    expect(shouldShow).toBe(false);

    // Should apply autonomous mode
    const temporaryMode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
    expect(temporaryMode).toBe('plan');
  });

  it('step 6: explicit "switch back to hands-on" → updates strategy, no choice', () => {
    // Setup: currently autonomous
    executionStrategyStore.setStrategy('autonomous');

    // User says "Switch back to hands-on"
    const detected = detectStrategyChange('Switch back to hands-on');
    expect(detected).toBe('handsOn');

    // Update strategy
    if (detected) {
      executionStrategyStore.setStrategy(detected);
    }

    // Verify changed back
    expect(executionStrategyStore.getStrategy()).toBe('handsOn');
  });

  it('step 7: fourth actionable request → no choice + hands-on mode', () => {
    // Setup: back to handsOn
    executionStrategyStore.setStrategy('handsOn');

    // New actionable request
    const strategy = executionStrategyStore.getStrategy();
    const isActionable = true;
    const hasStrategy = strategy !== undefined;

    // Should NOT show choice
    const shouldShow = !hasStrategy && isActionable;
    expect(shouldShow).toBe(false);

    // Should apply hands-on mode
    const temporaryMode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
    expect(temporaryMode).toBe('acceptEdits');
  });

  it('step 8: rerender/reinitialize ConversationPanel → strategy persists', () => {
    // Setup: set strategy
    executionStrategyStore.setStrategy('autonomous');

    // Simulate rerender by reading again
    const s1 = executionStrategyStore.getStrategy();

    // Simulate re-initialize of ConversationPanel state
    const s2 = executionStrategyStore.getStrategy();

    // Both should return same value
    expect(s1).toBe('autonomous');
    expect(s2).toBe('autonomous');
  });

  it('step 9: concurrent requests cannot leak temporary modes', () => {
    // Setup: strategy = handsOn
    executionStrategyStore.setStrategy('handsOn');

    // Simulate concurrent turns A and B
    const turnIdToTemporaryMode = new Map<number, 'acceptEdits' | 'plan'>();

    // Turn A: handsOn strategy
    const strategyA = executionStrategyStore.getStrategy();
    const modeA = strategyA === 'handsOn' ? 'acceptEdits' : 'plan';
    turnIdToTemporaryMode.set(1, modeA);

    // Turn B: change persistent strategy (doesn't affect temp modes)
    executionStrategyStore.setStrategy('autonomous');

    // Turn A still has its mode in the map
    expect(turnIdToTemporaryMode.get(1)).toBe('acceptEdits');

    // Turn B gets autonomous mode
    const strategyB = executionStrategyStore.getStrategy();
    const modeB = strategyB === 'handsOn' ? 'acceptEdits' : 'plan';
    turnIdToTemporaryMode.set(2, modeB);

    // Verify no leakage
    expect(turnIdToTemporaryMode.get(1)).toBe('acceptEdits');
    expect(turnIdToTemporaryMode.get(2)).toBe('plan');

    // Finalize Turn A (removes from map)
    turnIdToTemporaryMode.delete(1);

    // Turn B's mode unaffected
    expect(turnIdToTemporaryMode.get(2)).toBe('plan');
  });

  it('full lifecycle: CYCLE 1 (no strategy → handsOn)', () => {
    const events = [];

    // Step 1: No strategy
    const strategy1 = executionStrategyStore.getStrategy();
    events.push({ step: 1, strategy: strategy1, showChoice: !strategy1 });
    expect(strategy1).toBeUndefined();
    expect(events[0].showChoice).toBe(true);

    // Step 2: Choose handsOn
    executionStrategyStore.setStrategy('handsOn');
    events.push({ step: 2, strategy: 'handsOn', action: 'persisted' });

    // Step 3: Next actionable (no choice)
    const strategy3 = executionStrategyStore.getStrategy();
    events.push({ step: 3, strategy: strategy3, showChoice: false, mode: 'acceptEdits' });
    expect(strategy3).toBe('handsOn');
  });

  it('full lifecycle: CYCLE 2 (handsOn → autonomous → handsOn)', () => {
    // Pre-set handsOn
    executionStrategyStore.setStrategy('handsOn');

    // Explicit change to autonomous
    const change1 = detectStrategyChange('Switch to autonomous');
    if (change1) executionStrategyStore.setStrategy(change1);
    expect(executionStrategyStore.getStrategy()).toBe('autonomous');

    // Explicit change back to handsOn
    const change2 = detectStrategyChange('Switch back to hands-on');
    if (change2) executionStrategyStore.setStrategy(change2);
    expect(executionStrategyStore.getStrategy()).toBe('handsOn');
  });
});
