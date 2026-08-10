import { describe, expect, it } from 'vitest';
import { isIntelligenceTask, getLatestIntelligenceReport, getLatestExecutionPlan, INTELLIGENCE_TASK_ACTION_TYPES } from './intelligenceTaskDetection';
import type { ConversationTaskAction, ConversationTaskRecord } from '../conversation/ConversationTypes';
import type { IntelligenceReport } from '../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../shared/intelligence/RepositoryReportTypes';
import type { ExecutionPlan } from '../../shared/actions/ExecutionLifecycle';

function makeAction(type: string, data?: unknown): ConversationTaskAction {
  return {
    id: `a-${type}`,
    type,
    request: { type } as ConversationTaskAction['request'],
    result: data !== undefined ? ({ ok: true, data } as ConversationTaskAction['result']) : undefined,
    startedAt: 0,
    endedAt: 1,
    inProgressText: '',
  };
}

function makeTask(actions: ConversationTaskAction[]): ConversationTaskRecord {
  return { id: 't1', goal: 'test', status: 'completed', startedAt: 0, endedAt: 1, actions };
}

function makeRepoReport(): IntelligenceReport<RepositoryReportFields> {
  return {
    engineId: 'repository',
    subject: 'C:/repo',
    generatedAt: Date.now(),
    overallScore: 70,
    findings: [],
    observedSummary: '',
    requiresAccessSummary: [],
    domain: {
      repoPath: 'C:/repo',
      workspaceName: 'repo',
      language: 'TypeScript',
      framework: null,
      buildTool: null,
      packageManager: 'npm',
      isGitRepo: true,
      hasTests: true,
      hasDocker: false,
      recentCommitCount: 1,
    },
    approvalRequired: false,
  };
}

function makePlan(): ExecutionPlan {
  return { id: 'p1', sourceReportId: 'e1', steps: [], unplannableFindingIds: [], approvalRequired: true };
}

describe('isIntelligenceTask', () => {
  it('recognizes every registered Intelligence action type', () => {
    for (const type of INTELLIGENCE_TASK_ACTION_TYPES) {
      expect(isIntelligenceTask(makeTask([makeAction(type)]))).toBe(true);
    }
  });

  it('returns false for a task with no Intelligence actions', () => {
    expect(isIntelligenceTask(makeTask([makeAction('writeFile')]))).toBe(false);
  });

  it('returns true when at least one action among several matches', () => {
    expect(isIntelligenceTask(makeTask([makeAction('writeFile'), makeAction('analyzeRepository')]))).toBe(true);
  });
});

describe('getLatestIntelligenceReport', () => {
  it('finds the real report in a task action', () => {
    const report = getLatestIntelligenceReport(makeTask([makeAction('analyzeRepository', makeRepoReport())]));
    expect(report?.engineId).toBe('repository');
  });

  it('returns the most recent report when multiple exist', () => {
    const older = makeRepoReport();
    const newer = { ...makeRepoReport(), subject: 'C:/repo2' };
    const task = makeTask([makeAction('analyzeRepository', older), makeAction('analyzeRepository', newer)]);
    expect(getLatestIntelligenceReport(task)?.subject).toBe('C:/repo2');
  });

  it('returns undefined when no action produced a report', () => {
    expect(getLatestIntelligenceReport(makeTask([makeAction('writeFile')]))).toBeUndefined();
  });
});

describe('getLatestExecutionPlan', () => {
  it('finds the real plan in a task action', () => {
    const plan = getLatestExecutionPlan(makeTask([makeAction('proposeExecutionPlan', makePlan())]));
    expect(plan?.sourceReportId).toBe('e1');
  });

  it('returns undefined when no action produced a plan', () => {
    expect(getLatestExecutionPlan(makeTask([makeAction('analyzeRepository', makeRepoReport())]))).toBeUndefined();
  });
});
