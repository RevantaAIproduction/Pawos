import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-product-evidence-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { gatherAggregatedDomainReports } from './productEvidence';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../../../shared/intelligence/WebsiteReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';

function makeWebsiteReport(subject: string): IntelligenceReport<WebsiteReportFields> {
  return {
    engineId: 'website',
    subject,
    generatedAt: Date.now(),
    overallScore: 80,
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
    overallScore: 70,
    findings: [],
    observedSummary: 'ok',
    requiresAccessSummary: [],
    domain: {
      repoPath: subject,
      workspaceName: 'test-repo',
      language: 'TypeScript',
      framework: null,
      buildTool: null,
      packageManager: 'npm',
      isGitRepo: true,
      hasTests: false,
      hasDocker: false,
      recentCommitCount: 5,
    },
    approvalRequired: false,
  };
}

describe('gatherAggregatedDomainReports (real Memory Graph, no mocks beyond electron.app.getPath)', () => {
  beforeAll(() => memoryGraphStore.init());

  it('finds a real, previously-persisted Website Intelligence report for the requested URL', () => {
    const url = 'https://product-evidence-test.example/';
    recordIntelligenceReport(makeWebsiteReport(url));

    const evidence = gatherAggregatedDomainReports({ url });
    expect(evidence.website?.subject).toBe(url);
    expect(evidence.ux).toBeUndefined();
    expect(evidence.marketing).toBeUndefined();
  });

  it('finds a real, previously-persisted Repository Intelligence report for the requested repo path', () => {
    const repoPath = 'C:/fake/product-evidence-test-repo';
    recordIntelligenceReport(makeRepositoryReport(repoPath));

    const evidence = gatherAggregatedDomainReports({ repoPath });
    expect(evidence.repository?.subject).toBe(repoPath);
    expect(evidence.website).toBeUndefined();
  });

  it('honestly reports no data for a URL/repo that was never analyzed, rather than fabricating one', () => {
    const evidence = gatherAggregatedDomainReports({ url: 'https://never-analyzed.example/', repoPath: 'C:/never/analyzed' });
    expect(evidence.website).toBeUndefined();
    expect(evidence.ux).toBeUndefined();
    expect(evidence.marketing).toBeUndefined();
    expect(evidence.repository).toBeUndefined();
  });

  it('gathers no evidence at all when neither url nor repoPath is given', () => {
    const evidence = gatherAggregatedDomainReports({});
    expect(evidence.website).toBeUndefined();
    expect(evidence.repository).toBeUndefined();
    expect(evidence.requestedUrl).toBeUndefined();
    expect(evidence.requestedRepoPath).toBeUndefined();
  });
});
