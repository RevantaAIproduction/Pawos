import { describe, expect, it } from 'vitest';
import { assemblePromptModules, INTELLIGENCE_PROMPT_MODULES, type SystemPromptModule } from './systemPromptModules';

describe('INTELLIGENCE_PROMPT_MODULES', () => {
  it('keeps required always-on and execute-only modules registered', () => {
    const always = INTELLIGENCE_PROMPT_MODULES.filter((m) => m.tier === 'always');
    const executeOnly = INTELLIGENCE_PROMPT_MODULES.filter((m) => m.tier === 'executeOnly');
    expect(always.map((m) => m.id)).toEqual(expect.arrayContaining(['projectPlanningUx', 'intelligenceRuntime']));
    expect(executeOnly.map((m) => m.id)).toEqual(expect.arrayContaining(['executionPlanner']));
  });

  it('every module has non-empty content', () => {
    for (const m of INTELLIGENCE_PROMPT_MODULES) {
      expect(m.content.length).toBeGreaterThan(20);
    }
  });
});

describe('assemblePromptModules', () => {
  it('includes always-on modules regardless of canExecute', () => {
    expect(assemblePromptModules(false).some((c) => c.includes('Intelligence Runtime'))).toBe(true);
    expect(assemblePromptModules(true).some((c) => c.includes('Intelligence Runtime'))).toBe(true);
  });

  it('excludes executeOnly modules when canExecute is false', () => {
    expect(assemblePromptModules(false).some((c) => c.includes('Execution Planner'))).toBe(false);
  });

  it('includes executeOnly modules when canExecute is true', () => {
    expect(assemblePromptModules(true).some((c) => c.includes('Execution Planner'))).toBe(true);
  });

  it('respects a custom module list rather than always using the built-in Intelligence modules', () => {
    const custom: SystemPromptModule[] = [
      { id: 'always1', tier: 'always', content: 'ALWAYS_CONTENT' },
      { id: 'exec1', tier: 'executeOnly', content: 'EXEC_CONTENT' },
    ];
    expect(assemblePromptModules(false, custom)).toEqual(['ALWAYS_CONTENT']);
    expect(assemblePromptModules(true, custom)).toEqual(['ALWAYS_CONTENT', 'EXEC_CONTENT']);
  });
});
