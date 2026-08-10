import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-propose-execution-plan-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { proposeExecutionPlanPlugin } from './ProposeExecutionPlanPlugin';
import { CODING_EXECUTION_ACTION_TYPES } from '../../../../shared/actions/ActionTypes';
import type { ExecutionPlan } from '../../../../shared/actions/ExecutionLifecycle';
import type { IntelligenceReport, Finding } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';

function makeMissingTestsFinding(): Finding {
  return {
    id: 'missing-tests-finding',
    category: 'gap',
    severity: 'moderate',
    confidence: 'medium',
    statement: 'No test script or test files were found in the project.',
    evidenceRefs: ['context.hasTests'],
    provenance: 'observed',
  };
}

function makeRepositoryReport(subject: string): IntelligenceReport<RepositoryReportFields> {
  return {
    engineId: 'repository',
    subject,
    generatedAt: Date.now(),
    overallScore: 70,
    findings: [makeMissingTestsFinding()],
    observedSummary: '',
    requiresAccessSummary: [],
    domain: {
      repoPath: subject,
      workspaceName: 'propose-plan-test-repo',
      language: 'TypeScript',
      framework: null,
      buildTool: null,
      packageManager: 'npm',
      isGitRepo: true,
      hasTests: false,
      hasDocker: false,
      recentCommitCount: 1,
    },
    approvalRequired: false,
  };
}

describe('ProposeExecutionPlanPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('is the one Execute-class action in the Intelligence area — gated alongside every other real mutating action', () => {
    expect(CODING_EXECUTION_ACTION_TYPES).toContain('proposeExecutionPlan');
  });

  it('surfaces a requirement when no findings were approved', () => {
    const requirements = proposeExecutionPlanPlugin.requirements({
      type: 'proposeExecutionPlan',
      engineId: 'repository',
      subject: 'C:/anything',
      approvedFindingIds: [],
    });
    expect(requirements).toHaveLength(1);
  });

  it('surfaces a requirement when no report exists yet for the given engine/subject', () => {
    const requirements = proposeExecutionPlanPlugin.requirements({
      type: 'proposeExecutionPlan',
      engineId: 'repository',
      subject: 'C:/never-analyzed',
      approvedFindingIds: ['some-id'],
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.message).toMatch(/run the matching analysis/i);
  });

  it('builds and returns a real plan from an already-persisted report, never executing anything itself', async () => {
    const repoPath = 'C:/fake/propose-plan-test-repo';
    recordIntelligenceReport(makeRepositoryReport(repoPath));

    const result = await proposeExecutionPlanPlugin.execute({
      type: 'proposeExecutionPlan',
      engineId: 'repository',
      subject: repoPath,
      approvedFindingIds: ['missing-tests-finding'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.data as ExecutionPlan;
    expect(plan.approvalRequired).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.findingRefs).toEqual(['missing-tests-finding']);
    expect(plan.steps[0]?.status).toBe('proposed');
    expect(plan.steps[0]?.actionRequest.type).toBe('runCommand');
    expect(plan.unplannableFindingIds).toHaveLength(0);
  });

  it('fails honestly when no report exists for the given engine/subject at execution time', async () => {
    const result = await proposeExecutionPlanPlugin.execute({
      type: 'proposeExecutionPlan',
      engineId: 'repository',
      subject: 'C:/still-never-analyzed',
      approvedFindingIds: ['some-id'],
    });
    expect(result.ok).toBe(false);
  });

  it('fails honestly when no findings were approved at execution time', async () => {
    const result = await proposeExecutionPlanPlugin.execute({
      type: 'proposeExecutionPlan',
      engineId: 'repository',
      subject: 'C:/anything',
      approvedFindingIds: [],
    });
    expect(result.ok).toBe(false);
  });
});
