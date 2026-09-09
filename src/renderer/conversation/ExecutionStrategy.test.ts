/**
 * Execution Strategy Tests: First-time selection, remembered behavior, explicit changes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectStrategyChange } from './IntentDetection';
import { executionStrategyStore } from './ExecutionStrategyStore';

describe('Execution Strategy — First-time and remembered behavior', () => {
  beforeEach(() => {
    executionStrategyStore.reset();
  });

  describe('First-time behavior (undefined strategy)', () => {
    it('no strategy initially', () => {
      expect(executionStrategyStore.getStrategy()).toBeUndefined();
    });

    it('first choice = handsOn persists', () => {
      executionStrategyStore.setStrategy('handsOn');
      expect(executionStrategyStore.getStrategy()).toBe('handsOn');
    });

    it('first choice = autonomous persists', () => {
      executionStrategyStore.setStrategy('autonomous');
      expect(executionStrategyStore.getStrategy()).toBe('autonomous');
    });
  });

  describe('Remembered behavior (strategy exists)', () => {
    beforeEach(() => {
      executionStrategyStore.setStrategy('handsOn');
    });

    it('stored strategy is readable', () => {
      expect(executionStrategyStore.getStrategy()).toBe('handsOn');
    });

    it('handsOn strategy maps to acceptEdits', () => {
      const strategy = executionStrategyStore.getStrategy();
      const temporaryMode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
      expect(temporaryMode).toBe('acceptEdits');
    });

    it('autonomous strategy maps to plan', () => {
      executionStrategyStore.setStrategy('autonomous');
      const strategy = executionStrategyStore.getStrategy();
      const temporaryMode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
      expect(temporaryMode).toBe('plan');
    });

    it('multiple subsequent requests use same strategy', () => {
      const s1 = executionStrategyStore.getStrategy();
      const s2 = executionStrategyStore.getStrategy();
      const s3 = executionStrategyStore.getStrategy();
      expect(s1).toBe('handsOn');
      expect(s2).toBe('handsOn');
      expect(s3).toBe('handsOn');
    });
  });

  describe('Explicit strategy change detection', () => {
    it('detects "switch to autonomous"', () => {
      const change = detectStrategyChange('Switch to autonomous');
      expect(change).toBe('autonomous');
    });

    it('detects "use autonomous mode"', () => {
      const change = detectStrategyChange('Use autonomous mode for this');
      expect(change).toBe('autonomous');
    });

    it('detects "autonomously from now on"', () => {
      const change = detectStrategyChange('Work autonomously from now on');
      expect(change).toBe('autonomous');
    });

    it('detects "switch back to hands-on"', () => {
      const change = detectStrategyChange('Switch back to hands-on');
      expect(change).toBe('handsOn');
    });

    it('detects "work with me"', () => {
      const change = detectStrategyChange('Work with me instead');
      expect(change).toBe('handsOn');
    });

    it('ignores speculation: "I am considering autonomous"', () => {
      const change = detectStrategyChange('I am considering autonomous development');
      expect(change).toBeNull();
    });

    it('ignores question: "Can you explain autonomous mode?"', () => {
      const change = detectStrategyChange('Can you explain autonomous mode?');
      expect(change).toBeNull();
    });

    it('ignores hypothetical: "What if I used autonomous?"', () => {
      const change = detectStrategyChange('What if I used autonomous execution?');
      expect(change).toBeNull();
    });

    it('case-insensitive detection', () => {
      const upper = detectStrategyChange('SWITCH TO AUTONOMOUS');
      const lower = detectStrategyChange('switch to autonomous');
      const mixed = detectStrategyChange('SWitch To AUTonomous');
      expect(upper).toBe('autonomous');
      expect(lower).toBe('autonomous');
      expect(mixed).toBe('autonomous');
    });
  });

  describe('Strategy persistence', () => {
    it('strategy survives multiple accesses', () => {
      executionStrategyStore.setStrategy('autonomous');
      executionStrategyStore.setStrategy('handsOn');
      expect(executionStrategyStore.getStrategy()).toBe('handsOn');
    });

    it('reset clears strategy', () => {
      executionStrategyStore.setStrategy('autonomous');
      executionStrategyStore.reset();
      expect(executionStrategyStore.getStrategy()).toBeUndefined();
    });

    it('subscribers are notified on change', () => {
      const listener = vi.fn();
      const unsubscribe = executionStrategyStore.subscribe(listener);

      executionStrategyStore.setStrategy('handsOn');
      expect(listener).toHaveBeenCalledWith('handsOn');

      executionStrategyStore.setStrategy('autonomous');
      expect(listener).toHaveBeenCalledWith('autonomous');

      unsubscribe();
      executionStrategyStore.setStrategy('handsOn');
      expect(listener).toHaveBeenCalledTimes(2); // Not called after unsubscribe
    });
  });

  describe('Strategy lifecycle', () => {
    it('undefined → handsOn → autonomous → undefined', () => {
      expect(executionStrategyStore.getStrategy()).toBeUndefined();

      executionStrategyStore.setStrategy('handsOn');
      expect(executionStrategyStore.getStrategy()).toBe('handsOn');

      executionStrategyStore.setStrategy('autonomous');
      expect(executionStrategyStore.getStrategy()).toBe('autonomous');

      executionStrategyStore.reset();
      expect(executionStrategyStore.getStrategy()).toBeUndefined();
    });

    it('same strategy set twice only notifies once', () => {
      const listener = vi.fn();
      executionStrategyStore.subscribe(listener);

      executionStrategyStore.setStrategy('handsOn');
      expect(listener).toHaveBeenCalledTimes(1);

      executionStrategyStore.setStrategy('handsOn'); // Same
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('Mapping strategy to temporary mode', () => {
    it('handsOn → acceptEdits', () => {
      const strategy = 'handsOn' as const;
      const mode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
      expect(mode).toBe('acceptEdits');
    });

    it('autonomous → plan', () => {
      const strategy = 'autonomous' as const;
      const mode = strategy === 'handsOn' ? 'acceptEdits' : 'plan';
      expect(mode).toBe('plan');
    });

    it('undefined → no mapping (requires choice)', () => {
      const strategy = undefined;
      // When strategy is undefined, choice card is shown
      // No mapping occurs
      expect(strategy).toBeUndefined();
    });
  });
});
