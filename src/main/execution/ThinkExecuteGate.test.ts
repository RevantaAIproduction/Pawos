import { describe, expect, it } from 'vitest';
import { codingExecutionBlocked, infraExecutionBlocked } from './ThinkExecuteGate';

describe('codingExecutionBlocked', () => {
  it('blocks a Go-tier request even if the local CodingModeStore preference is pro', () => {
    expect(codingExecutionBlocked('writeFile', /* canExecute */ false, 'pro')).toBe(true);
  });

  it('blocks a Pro-tier request when the local preference is still go (a safety default)', () => {
    expect(codingExecutionBlocked('writeFile', /* canExecute */ true, 'go')).toBe(true);
  });

  it('allows a Pro-tier request when the local preference is pro', () => {
    expect(codingExecutionBlocked('writeFile', /* canExecute */ true, 'pro')).toBe(false);
  });

  it('never blocks an action type outside CODING_EXECUTION_ACTION_TYPES, regardless of tier', () => {
    expect(codingExecutionBlocked('analyzeProject', /* canExecute */ false, 'go')).toBe(false);
  });
});

describe('codingExecutionBlocked — Intelligence Execution Planner entitlement (proposeExecutionPlan)', () => {
  it('blocks proposeExecutionPlan on a Go-tier request regardless of the local CodingModeStore preference', () => {
    expect(codingExecutionBlocked('proposeExecutionPlan', /* canExecute */ false, 'pro')).toBe(true);
  });

  it('allows proposeExecutionPlan for a Pro-tier request when the local preference is pro', () => {
    expect(codingExecutionBlocked('proposeExecutionPlan', /* canExecute */ true, 'pro')).toBe(false);
  });

  it('blocks proposeExecutionPlan for a Pro-tier request when the local preference is still go (a safety default) — a plan is Execute-class, not Think-class, even though it only ever produces a reviewable artifact', () => {
    expect(codingExecutionBlocked('proposeExecutionPlan', /* canExecute */ true, 'go')).toBe(true);
  });
});

describe('infraExecutionBlocked', () => {
  it('blocks a Go-tier request even if the local InfraModeStore preference is full', () => {
    expect(infraExecutionBlocked('deployProject', /* canExecute */ false, 'full')).toBe(true);
  });

  it('blocks a Pro-tier request when the local preference is still investigate (a safety default)', () => {
    expect(infraExecutionBlocked('deployProject', /* canExecute */ true, 'investigate')).toBe(true);
  });

  it('allows a Pro-tier request when the local preference is full', () => {
    expect(infraExecutionBlocked('deployProject', /* canExecute */ true, 'full')).toBe(false);
  });

  it('never blocks an action type outside INFRA_EXECUTION_ACTION_TYPES, regardless of tier', () => {
    expect(infraExecutionBlocked('investigateTicket', /* canExecute */ false, 'investigate')).toBe(false);
  });
});
