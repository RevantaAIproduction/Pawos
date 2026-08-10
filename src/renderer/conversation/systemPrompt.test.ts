import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt';

describe('buildSystemPrompt', () => {
  it('always includes the core prompt content', () => {
    expect(buildSystemPrompt(false)).toContain('You are Paw, an intelligent desktop employee');
    expect(buildSystemPrompt(true)).toContain('You are Paw, an intelligent desktop employee');
  });

  it('always includes the always-on Intelligence Runtime module regardless of tier', () => {
    expect(buildSystemPrompt(false)).toContain('Intelligence Runtime:');
    expect(buildSystemPrompt(true)).toContain('Intelligence Runtime:');
  });

  it('omits the Execute-class Execution Planner module when canExecute is false', () => {
    expect(buildSystemPrompt(false)).not.toContain('Execution Planner (Paw Pro)');
  });

  it('includes the Execute-class Execution Planner module when canExecute is true', () => {
    expect(buildSystemPrompt(true)).toContain('Execution Planner (Paw Pro)');
  });

  it('is additive, never a rewrite of the core — the executing tier\'s prompt starts with the exact non-executing prompt, plus more', () => {
    expect(buildSystemPrompt(true).length).toBeGreaterThan(buildSystemPrompt(false).length);
    expect(buildSystemPrompt(true).startsWith(buildSystemPrompt(false))).toBe(true);
  });
});
