import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt } from './systemPrompt';

describe('Resume building is PawOS Build only', () => {
  let getToolDefinitionsForEntitlement: typeof import('../ai/IntentRegistry').getToolDefinitionsForEntitlement;
  beforeAll(async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, addEventListener: () => {}, removeEventListener: () => {} });
    ({ getToolDefinitionsForEntitlement } = await import('../ai/IntentRegistry'));
  }, 30000);

  it('the resume tool is offered only when the plan includes resumes', () => {
    const names = (canExecute: boolean, resumes: boolean) => getToolDefinitionsForEntitlement(canExecute, resumes).map((t) => t.name);
    expect(names(true, true)).toContain('present_resume');
    expect(names(true, false)).not.toContain('present_resume');
    expect(names(false, false)).not.toContain('present_resume');
  });

  it('the AI gets the resume rules on Build, and "Build only" everywhere else', () => {
    expect(buildSystemPrompt(true, true)).toContain('present_resume');
    const other = buildSystemPrompt(true, false);
    expect(other).not.toContain('call present_resume');
    expect(other).toContain('resume building is part of PawOS Build only');
  });
});
