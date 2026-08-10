import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ask-founder-advisor-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { recordIntelligenceReport, findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { askFounderAdvisorPlugin } from './AskFounderAdvisorPlugin';
import type { IntelligenceReport, Finding } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';
import type { FounderReportFields } from '../../../../shared/intelligence/FounderReportTypes';

function makeCriticalFinding(): Finding {
  return {
    id: 'crit1',
    category: 'risk',
    severity: 'critical',
    confidence: 'high',
    statement: 'A critical, unaddressed security risk was found.',
    evidenceRefs: [],
    provenance: 'observed',
  };
}

function makeRepositoryReport(subject: string): IntelligenceReport<RepositoryReportFields> {
  return {
    engineId: 'repository',
    subject,
    generatedAt: Date.now(),
    overallScore: 40,
    findings: [makeCriticalFinding()],
    observedSummary: 'ok',
    requiresAccessSummary: [],
    domain: {
      repoPath: subject,
      workspaceName: 'ask-founder-advisor-test-repo',
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

describe('AskFounderAdvisorPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('surfaces a requirement instead of executing blind when neither url nor repoPath is given', () => {
    const requirements = askFounderAdvisorPlugin.requirements({ type: 'askFounderAdvisor' });
    expect(requirements).toHaveLength(1);
  });

  it('composes strategic recommendations from an already-persisted Repository report, including a real top priority and a technical-architect recommendation', async () => {
    const repoPath = 'C:/fake/ask-founder-advisor-test-repo';
    recordIntelligenceReport(makeRepositoryReport(repoPath));

    const result = await askFounderAdvisorPlugin.execute({ type: 'askFounderAdvisor', repoPath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as IntelligenceReport<FounderReportFields>;
    expect(report.engineId).toBe('founder');
    expect(report.approvalRequired).toBe(false);
    expect(report.domain.domainsAnalyzed).toContain('repository');
    expect(report.domain.topPriority?.severity).toBe('critical');
    expect(report.domain.topPriority?.statement).toContain('critical, unaddressed security risk');
    expect(report.findings.some((f) => f.statement.startsWith('As a technical architect:'))).toBe(true);

    const persisted = findLatestIntelligenceReport('founder', repoPath);
    expect(persisted).toBeDefined();
  });

  it('fails honestly when neither url nor repoPath is provided at execution time', async () => {
    const result = await askFounderAdvisorPlugin.execute({ type: 'askFounderAdvisor' });
    expect(result.ok).toBe(false);
  });
});
