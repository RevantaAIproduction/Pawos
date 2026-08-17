import { describe, expect, it } from 'vitest';
import { EDIT_ACTION_TYPES, EXECUTION_MODE_CATALOG, buildPlanModeInstruction, shouldAutoConfirmAction } from './ExecutionModeTypes';

describe('shouldAutoConfirmAction', () => {
  it('manual mode never auto-confirms anything', () => {
    expect(shouldAutoConfirmAction('manual', 'writeFile', false)).toBe(false);
    expect(shouldAutoConfirmAction('manual', 'runCommand', true)).toBe(false);
  });

  it('auto mode never auto-confirms anything (preserves today\'s default behavior)', () => {
    expect(shouldAutoConfirmAction('auto', 'writeFile', false)).toBe(false);
    expect(shouldAutoConfirmAction('auto', 'runCommand', true)).toBe(false);
  });

  it('plan mode never auto-confirms anything', () => {
    expect(shouldAutoConfirmAction('plan', 'writeFile', false)).toBe(false);
    expect(shouldAutoConfirmAction('plan', 'applyCodeEdit', true)).toBe(false);
  });

  it('acceptEdits mode auto-confirms writeFile and applyCodeEdit only', () => {
    expect(shouldAutoConfirmAction('acceptEdits', 'writeFile', false)).toBe(true);
    expect(shouldAutoConfirmAction('acceptEdits', 'applyCodeEdit', false)).toBe(true);
  });

  it('acceptEdits mode never auto-confirms non-edit destructive actions', () => {
    expect(shouldAutoConfirmAction('acceptEdits', 'runCommand', false)).toBe(false);
    expect(shouldAutoConfirmAction('acceptEdits', 'deployProject', false)).toBe(false);
    expect(shouldAutoConfirmAction('acceptEdits', 'gitCommit', false)).toBe(false);
  });

  it('acceptEdits mode is unaffected by the bypass-permissions setting either way', () => {
    expect(shouldAutoConfirmAction('acceptEdits', 'writeFile', true)).toBe(true);
    expect(shouldAutoConfirmAction('acceptEdits', 'runCommand', true)).toBe(false);
  });

  it('bypass mode auto-confirms everything ONLY when the setting is explicitly enabled', () => {
    expect(shouldAutoConfirmAction('bypass', 'writeFile', true)).toBe(true);
    expect(shouldAutoConfirmAction('bypass', 'runCommand', true)).toBe(true);
    expect(shouldAutoConfirmAction('bypass', 'deployProject', true)).toBe(true);
  });

  it('bypass mode auto-confirms NOTHING when the setting is off (default) — the security-critical case', () => {
    expect(shouldAutoConfirmAction('bypass', 'writeFile', false)).toBe(false);
    expect(shouldAutoConfirmAction('bypass', 'runCommand', false)).toBe(false);
    expect(shouldAutoConfirmAction('bypass', 'deployProject', false)).toBe(false);
  });
});

describe('EXECUTION_MODE_CATALOG', () => {
  it('has exactly the 5 modes, each with a real label and description', () => {
    expect(EXECUTION_MODE_CATALOG.map((m) => m.id)).toEqual(['manual', 'acceptEdits', 'plan', 'auto', 'bypass']);
    for (const mode of EXECUTION_MODE_CATALOG) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
    }
  });
});

describe('EDIT_ACTION_TYPES', () => {
  it('is exactly writeFile and applyCodeEdit — the two self-gated edit plugins', () => {
    expect(EDIT_ACTION_TYPES).toEqual(['writeFile', 'applyCodeEdit']);
  });
});

describe('buildPlanModeInstruction', () => {
  it('returns a non-empty instruction mentioning the real plan tools', () => {
    const instruction = buildPlanModeInstruction();
    expect(instruction).toContain('propose_execution_plan');
    expect(instruction).toContain('propose_code_edit_plan');
  });
});
