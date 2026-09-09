import { describe, it, expect } from 'vitest';
import { shouldShowExecutionChoice } from './IntentDetection';
import type { WindowContext } from './ConversationTypes';

const emptyContext: WindowContext = {};
const projectContext: WindowContext = { project: { id: 'proj-1', name: 'Test' } };

describe('IntentDetection.shouldShowExecutionChoice', () => {
  describe('Pure questions', () => {
    it('returns false for "What is React?"', () => {
      expect(shouldShowExecutionChoice('What is React?', emptyContext, false, false)).toBe(false);
    });

    it('returns false for "Can you explain this?"', () => {
      expect(shouldShowExecutionChoice('Can you explain this?', emptyContext, false, false)).toBe(false);
    });

    it('returns false for "Why would I use TypeScript?"', () => {
      expect(shouldShowExecutionChoice('Why would I use TypeScript?', emptyContext, false, false)).toBe(false);
    });

    it('returns false for "How do I install dependencies?"', () => {
      expect(shouldShowExecutionChoice('How do I install dependencies?', emptyContext, false, false)).toBe(false);
    });
  });

  describe('Conditional/Hypothetical', () => {
    it('returns false for "What if I change the auth flow?"', () => {
      expect(shouldShowExecutionChoice('What if I change the auth flow?', emptyContext, false, false)).toBe(false);
    });

    it('returns false for "What would happen if I refactored this?"', () => {
      expect(shouldShowExecutionChoice('What would happen if I refactored this?', emptyContext, false, false)).toBe(false);
    });

    it('returns false for "Could we deploy to staging?"', () => {
      expect(shouldShowExecutionChoice('Could we deploy to staging?', emptyContext, false, false)).toBe(false);
    });
  });

  describe('Actionable imperatives', () => {
    it('returns true for "Build a landing page"', () => {
      expect(shouldShowExecutionChoice('Build a landing page', emptyContext, false, false)).toBe(true);
    });

    it('returns true for "Change the navbar"', () => {
      expect(shouldShowExecutionChoice('Change the navbar', emptyContext, false, false)).toBe(true);
    });

    it('returns true for "Fix this bug"', () => {
      expect(shouldShowExecutionChoice('Fix this bug', emptyContext, false, false)).toBe(true);
    });

    it('returns true for "Implement user authentication"', () => {
      expect(shouldShowExecutionChoice('Implement user authentication', emptyContext, false, false)).toBe(true);
    });

    it('returns true for "Refactor this component."', () => {
      expect(shouldShowExecutionChoice('Refactor this component.', emptyContext, false, false)).toBe(true);
    });

    it('returns true for "Create a new database migration"', () => {
      expect(shouldShowExecutionChoice('Create a new database migration', emptyContext, false, false)).toBe(true);
    });

    it('returns true for "Deploy to production"', () => {
      expect(shouldShowExecutionChoice('Deploy to production', emptyContext, false, false)).toBe(true);
    });
  });

  describe('Assets present', () => {
    it('returns true for actionable request with image', () => {
      expect(shouldShowExecutionChoice('Build this', emptyContext, true, false)).toBe(true);
    });

    it('returns true for actionable request with file context', () => {
      expect(shouldShowExecutionChoice('Change the layout', emptyContext, false, true)).toBe(true);
    });

    it('returns true for actionable request with project context', () => {
      expect(shouldShowExecutionChoice('Create a new page', projectContext, false, false)).toBe(true);
    });

    it('returns true for "Recreate this design from the screenshot?"', () => {
      expect(shouldShowExecutionChoice('Recreate this design from the screenshot?', emptyContext, true, false)).toBe(true);
    });
  });

  describe('Non-actionable with assets', () => {
    it('returns false for "Can you explain this screenshot?" + image', () => {
      expect(shouldShowExecutionChoice('Can you explain this screenshot?', emptyContext, true, false)).toBe(false);
    });

    it('returns false for "What do you think of this design?" + image', () => {
      expect(shouldShowExecutionChoice('What do you think of this design?', emptyContext, true, false)).toBe(false);
    });

    it('returns false for "Analyze this screenshot" (pure analysis, no build)', () => {
      // Note: "Analyze" is not in actionable verbs, it's analysis-only
      expect(shouldShowExecutionChoice('Analyze this screenshot', emptyContext, true, false)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('returns false for empty message', () => {
      expect(shouldShowExecutionChoice('', emptyContext, false, false)).toBe(false);
    });

    it('returns false for whitespace only', () => {
      expect(shouldShowExecutionChoice('   ', emptyContext, false, false)).toBe(false);
    });

    it('handles mixed case actionable verbs', () => {
      expect(shouldShowExecutionChoice('BUILD a landing page', emptyContext, false, false)).toBe(true);
    });

    it('handles multiple actionable verbs', () => {
      expect(shouldShowExecutionChoice('Create and deploy the website', emptyContext, false, false)).toBe(true);
    });
  });
});
