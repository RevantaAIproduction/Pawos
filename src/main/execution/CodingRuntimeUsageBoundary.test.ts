import { describe, expect, it, vi } from 'vitest';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { UsageCheckResult } from '../billing/UsageEngine';
import { classifyActionUsageCapability, shouldEnforceCustomerUsage } from './ActionUsageClassifier';
import { enforceCodingRuntimeUsage } from './CodingRuntimeUsageBoundary';

function fakeUsageEngine(check: UsageCheckResult) {
  return {
    canConsume: vi.fn(() => check),
    recordUsage: vi.fn(),
  };
}

const executeRequest: ActionRequest = {
  type: 'runValidationPipeline',
  rootPath: 'C:\\project',
};

describe('ActionUsageClassifier', () => {
  it('classifies Coding Runtime execution actions into existing UsageCapability values', () => {
    expect(classifyActionUsageCapability('writeFile')).toBe('codeExecution');
    expect(classifyActionUsageCapability('runValidationPipeline')).toBe('longRunningWorkflow');
    expect(classifyActionUsageCapability('devBrowserPreview')).toBe('browserAutomation');
    expect(classifyActionUsageCapability('deployProject')).toBe('autonomousExecution');
  });

  it('keeps analysis/guidance-class actions classified but not execution-enforced', () => {
    expect(classifyActionUsageCapability('analyzeProjectStructure')).toBe('repositoryAnalysis');
    expect(shouldEnforceCustomerUsage('analyzeProjectStructure')).toBe(false);
    expect(shouldEnforceCustomerUsage('runCommand')).toBe(true);
  });

  it('excludes Platform Runtime and autonomous task bookkeeping from customer execution usage', () => {
    expect(shouldEnforceCustomerUsage('startAutonomousEngineeringTask')).toBe(false);
    expect(classifyActionUsageCapability('startAutonomousEngineeringTask')).toBe('autonomousExecution');
  });
});

describe('CodingRuntimeUsageBoundary', () => {
  it('rejects exhausted non-pooled usage through the existing UsageEngine result', async () => {
    const engine = fakeUsageEngine({ allowed: false, pooled: false, reason: 'codeExecution usage limit reached' });
    const result = await enforceCodingRuntimeUsage({ type: 'writeFile', path: 'C:\\project\\a.ts', content: 'x' }, { usageEngine: engine });

    expect(result).toEqual({
      ok: false,
      reason: 'usage-restricted',
      message: 'codeExecution usage limit reached',
      data: { capability: 'codeExecution' },
    });
    expect(engine.recordUsage).not.toHaveBeenCalled();
  });

  it('records successful non-pooled usage before plugin execution', async () => {
    const engine = fakeUsageEngine({ allowed: true, pooled: false });
    const result = await enforceCodingRuntimeUsage(executeRequest, { usageEngine: engine });

    expect(result).toBeNull();
    expect(engine.canConsume).toHaveBeenCalledWith('longRunningWorkflow', 1);
    expect(engine.recordUsage).toHaveBeenCalledWith('longRunningWorkflow', 1);
  });

  it('records Enterprise pooled usage through the organization recorder instead of local counters', async () => {
    const engine = fakeUsageEngine({ allowed: true, pooled: true, deferTo: 'organizationUsageService' });
    const pooledRecorder = vi.fn(async () => ({ ok: true as const }));
    const result = await enforceCodingRuntimeUsage(
      { ...executeRequest, scope: { userId: 'user-1', organizationId: 'org-1' } },
      { usageEngine: engine, pooledRecorder }
    );

    expect(result).toBeNull();
    expect(engine.recordUsage).not.toHaveBeenCalled();
    expect(pooledRecorder).toHaveBeenCalledWith({
      organizationId: 'org-1',
      capability: 'longRunningWorkflow',
      amount: 1,
      request: { ...executeRequest, scope: { userId: 'user-1', organizationId: 'org-1' } },
    });
  });

  it('allows Enterprise Coding Runtime execution when pooled usage is available', async () => {
    let pluginExecuted = false;
    const engine = fakeUsageEngine({ allowed: true, pooled: true, deferTo: 'organizationUsageService' });
    const pooledRecorder = vi.fn(async () => ({ ok: true as const }));
    const blocked = await enforceCodingRuntimeUsage(
      { ...executeRequest, scope: { userId: 'user-1', organizationId: 'org-1' } },
      { usageEngine: engine, pooledRecorder }
    );
    if (!blocked) pluginExecuted = true;

    expect(blocked).toBeNull();
    expect(pluginExecuted).toBe(true);
  });

  it('blocks exhausted Enterprise pooled usage before plugin execution', async () => {
    let pluginExecuted = false;
    const engine = fakeUsageEngine({ allowed: true, pooled: true, deferTo: 'organizationUsageService' });
    const pooledRecorder = vi.fn(async () => ({ ok: false as const, message: 'organization pool exhausted' }));
    const blocked = await enforceCodingRuntimeUsage(
      { ...executeRequest, scope: { userId: 'user-1', organizationId: 'org-1' } },
      { usageEngine: engine, pooledRecorder }
    );
    if (!blocked) pluginExecuted = true;

    expect(blocked).toEqual({
      ok: false,
      reason: 'usage-restricted',
      message: 'organization pool exhausted',
      data: { capability: 'longRunningWorkflow' },
    });
    expect(pluginExecuted).toBe(false);
  });

  it('continues using the local UsageEngine path for non-Enterprise users', async () => {
    const engine = fakeUsageEngine({ allowed: true, pooled: false });
    const pooledRecorder = vi.fn(async () => ({ ok: true as const }));
    const result = await enforceCodingRuntimeUsage(executeRequest, { usageEngine: engine, pooledRecorder });

    expect(result).toBeNull();
    expect(engine.recordUsage).toHaveBeenCalledWith('longRunningWorkflow', 1);
    expect(pooledRecorder).not.toHaveBeenCalled();
  });

  it('fails closed for Enterprise pooled execution without an organization recorder', async () => {
    const engine = fakeUsageEngine({ allowed: true, pooled: true, deferTo: 'organizationUsageService' });
    const result = await enforceCodingRuntimeUsage(
      { ...executeRequest, scope: { userId: 'user-1', organizationId: 'org-1' } },
      { usageEngine: engine, pooledRecorder: null }
    );

    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.reason).toBe('usage-restricted');
  });

  it('does not charge plugin-level confirmation prompts before execution', async () => {
    const engine = fakeUsageEngine({ allowed: true, pooled: false });
    const result = await enforceCodingRuntimeUsage({ type: 'applyCodeEdit', path: 'C:\\project\\a.ts', edits: [] }, { usageEngine: engine });

    expect(result).toBeNull();
    expect(engine.canConsume).not.toHaveBeenCalled();
    expect(engine.recordUsage).not.toHaveBeenCalled();
  });
});
