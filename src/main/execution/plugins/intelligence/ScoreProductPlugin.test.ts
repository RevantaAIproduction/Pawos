import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-score-product-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { recordIntelligenceReport, findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { scoreProductPlugin } from './ScoreProductPlugin';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../../../shared/intelligence/WebsiteReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';
import type { ProductReportFields } from '../../../../shared/intelligence/ProductReportTypes';

function makeWebsiteReport(subject: string): IntelligenceReport<WebsiteReportFields> {
  return {
    engineId: 'website',
    subject,
    generatedAt: Date.now(),
    overallScore: 90,
    findings: [],
    observedSummary: 'ok',
    requiresAccessSummary: [],
    domain: {
      startUrl: subject,
      origin: new URL(subject).origin,
      usesHttps: true,
      robotsTxtFound: true,
      disallowedPathsSkipped: [],
      pagesVisited: 1,
      pagesFailed: 0,
      hitCrawlBound: false,
      securityHeaders: { contentSecurityPolicy: true, strictTransportSecurity: true, xFrameOptions: true },
      pages: [],
    },
    approvalRequired: false,
  };
}

function makeRepositoryReport(subject: string): IntelligenceReport<RepositoryReportFields> {
  return {
    engineId: 'repository',
    subject,
    generatedAt: Date.now(),
    overallScore: 75,
    findings: [],
    observedSummary: 'ok',
    requiresAccessSummary: [],
    domain: {
      repoPath: subject,
      workspaceName: 'score-product-test-repo',
      language: 'TypeScript',
      framework: null,
      buildTool: null,
      packageManager: 'npm',
      isGitRepo: true,
      hasTests: true,
      hasDocker: false,
      recentCommitCount: 3,
    },
    approvalRequired: false,
  };
}

describe('ScoreProductPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('surfaces a requirement instead of executing blind when neither url nor repoPath is given', () => {
    const requirements = scoreProductPlugin.requirements({ type: 'scoreProduct' });
    expect(requirements).toHaveLength(1);
  });

  it('aggregates already-persisted Website and Repository reports and persists a Product Intelligence report', async () => {
    const url = 'https://score-product-test.example/';
    const repoPath = 'C:/fake/score-product-test-repo';
    recordIntelligenceReport(makeWebsiteReport(url));
    recordIntelligenceReport(makeRepositoryReport(repoPath));

    const result = await scoreProductPlugin.execute({ type: 'scoreProduct', url, repoPath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as IntelligenceReport<ProductReportFields>;
    expect(report.engineId).toBe('product');
    expect(report.approvalRequired).toBe(false);
    expect(report.domain.domainsAnalyzed).toContain('website');
    expect(report.domain.domainsAnalyzed).toContain('repository');
    expect(report.domain.domainsMissing).toContain('ux');
    expect(report.domain.domainsMissing).toContain('marketing');

    const persisted = findLatestIntelligenceReport('product', url);
    expect(persisted).toBeDefined();
  });

  it('honestly names every domain as missing when nothing has been analyzed yet for a fresh subject', async () => {
    const result = await scoreProductPlugin.execute({ type: 'scoreProduct', url: 'https://never-scored.example/' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<ProductReportFields>;
    expect(report.domain.domainsAnalyzed).toHaveLength(0);
    expect(report.domain.domainsMissing).toEqual(['website', 'ux', 'marketing']);
  });

  it('fails honestly when neither url nor repoPath is provided at execution time', async () => {
    const result = await scoreProductPlugin.execute({ type: 'scoreProduct' });
    expect(result.ok).toBe(false);
  });
});
