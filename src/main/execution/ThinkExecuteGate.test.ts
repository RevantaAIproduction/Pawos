import { describe, expect, it } from 'vitest';
import { CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import { accountExecutionBlocked, codingExecutionBlocked, infraExecutionBlocked } from './ThinkExecuteGate';

describe('codingExecutionBlocked', () => {
  it('blocks a tier without execution (no advancedRuntimes) even if the local CodingModeStore preference is pro', () => {
    expect(codingExecutionBlocked('writeFile', /* canExecute */ false, 'pro')).toBe(true);
  });

  it('blocks an execution-entitled tier (Go or Pro) when the local preference is still go (a safety default)', () => {
    expect(codingExecutionBlocked('writeFile', /* canExecute */ true, 'go')).toBe(true);
  });

  it('allows an execution-entitled tier when the local preference is pro', () => {
    expect(codingExecutionBlocked('writeFile', /* canExecute */ true, 'pro')).toBe(false);
  });

  it('never blocks an action type outside CODING_EXECUTION_ACTION_TYPES, regardless of tier', () => {
    expect(codingExecutionBlocked('analyzeProject', /* canExecute */ false, 'go')).toBe(false);
  });
});

describe('codingExecutionBlocked — Intelligence Execution Planner entitlement (proposeExecutionPlan)', () => {
  it('blocks proposeExecutionPlan on a tier without execution regardless of the local CodingModeStore preference', () => {
    expect(codingExecutionBlocked('proposeExecutionPlan', /* canExecute */ false, 'pro')).toBe(true);
  });

  it('allows proposeExecutionPlan for an execution-entitled tier when the local preference is pro', () => {
    expect(codingExecutionBlocked('proposeExecutionPlan', /* canExecute */ true, 'pro')).toBe(false);
  });

  it('blocks proposeExecutionPlan for an execution-entitled tier when the local preference is still go (a safety default) — a plan is Execute-class, not Think-class, even though it only ever produces a reviewable artifact', () => {
    expect(codingExecutionBlocked('proposeExecutionPlan', /* canExecute */ true, 'go')).toBe(true);
  });
});

describe('infraExecutionBlocked', () => {
  it('blocks a tier without execution even if the local InfraModeStore preference is full', () => {
    expect(infraExecutionBlocked('deployProject', /* canExecute */ false, 'full')).toBe(true);
  });

  it('blocks an execution-entitled tier when the local preference is still investigate (a safety default)', () => {
    expect(infraExecutionBlocked('deployProject', /* canExecute */ true, 'investigate')).toBe(true);
  });

  it('allows an execution-entitled tier when the local preference is full', () => {
    expect(infraExecutionBlocked('deployProject', /* canExecute */ true, 'full')).toBe(false);
  });

  it('never blocks an action type outside INFRA_EXECUTION_ACTION_TYPES, regardless of tier', () => {
    expect(infraExecutionBlocked('investigateTicket', /* canExecute */ false, 'investigate')).toBe(false);
  });
});

describe('accountExecutionBlocked', () => {
  it('blocks every coding and infrastructure execution action when no account is verified', () => {
    for (const type of [...CODING_EXECUTION_ACTION_TYPES, ...INFRA_EXECUTION_ACTION_TYPES]) {
      expect(accountExecutionBlocked(type, null)).toBe(true);
      expect(accountExecutionBlocked(type, '')).toBe(true);
    }
  });

  it('allows them with a verified account (the plan and the local mode are checked separately)', () => {
    for (const type of [...CODING_EXECUTION_ACTION_TYPES, ...INFRA_EXECUTION_ACTION_TYPES]) {
      expect(accountExecutionBlocked(type, 'user-1')).toBe(false);
    }
  });

  it('never blocks read-only or local actions outside those groups', () => {
    for (const type of ['analyzeProject', 'readFile', 'listDirectory', 'gitStatus', 'gitDiff', 'investigateTicket', 'getCodingMode', 'setCodingMode'] as const) {
      expect(accountExecutionBlocked(type, null)).toBe(false);
    }
  });
});
