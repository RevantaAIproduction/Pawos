import { beforeAll, describe, expect, it, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import type { AddressInfo } from 'net';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-cross-engine-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../memory/MemoryGraphStore';
import { analyzeWebsitePlugin } from '../execution/plugins/intelligence/AnalyzeWebsitePlugin';
import { reviewUxPlugin } from '../execution/plugins/intelligence/ReviewUxPlugin';
import { analyzeMarketingPlugin } from '../execution/plugins/intelligence/AnalyzeMarketingPlugin';
import { analyzeRepositoryPlugin } from '../execution/plugins/intelligence/AnalyzeRepositoryPlugin';
import { scoreProductPlugin } from '../execution/plugins/intelligence/ScoreProductPlugin';
import { askFounderAdvisorPlugin } from '../execution/plugins/intelligence/AskFounderAdvisorPlugin';
import { proposeExecutionPlanPlugin } from '../execution/plugins/intelligence/ProposeExecutionPlanPlugin';
import type { IntelligenceReport, Finding } from '../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../shared/intelligence/WebsiteReportTypes';
import type { UxReportFields } from '../../shared/intelligence/UxReportTypes';
import type { MarketingReportFields } from '../../shared/intelligence/MarketingReportTypes';
import type { RepositoryReportFields } from '../../shared/intelligence/RepositoryReportTypes';
import type { ProductReportFields } from '../../shared/intelligence/ProductReportTypes';
import type { FounderReportFields } from '../../shared/intelligence/FounderReportTypes';
import type { ExecutionPlan } from '../../shared/actions/ExecutionLifecycle';

// A single fixture page, deliberately missing a <title>, a meta description, Open Graph tags, and
// a Twitter Card tag — real gaps a real crawl of this real local server will really find, rather
// than fabricated findings. This is what lets Website Intelligence's SEO-gap rule and Marketing
// Intelligence's social-tag-gap rule both fire honestly off the exact same real page.
const NO_SEO_NO_SOCIAL_HTML =
  '<html><head></head><body><p>A minimal page with real content but no SEO or social metadata whatsoever, on purpose.</p></body></html>';

function startServer(handler: http.RequestListener): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}

function siteHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === '/robots.txt') {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(NO_SEO_NO_SOCIAL_HTML);
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { critical: 4, major: 3, moderate: 2, minor: 1, info: 0 };

describe('Cross-engine real pipeline integration (no mocks except electron.app.getPath)', () => {
  beforeAll(() => memoryGraphStore.init());

  describe('Website + UX + Marketing -> Product -> Founder, over one real local site', () => {
    let close: (() => Promise<void>) | undefined;

    afterEach(async () => {
      await close?.();
      close = undefined;
    });

    it('runs the full real analyze -> aggregate -> compose pipeline and preserves provenance end-to-end', async () => {
      const server = await startServer(siteHandler);
      close = server.close;
      const url = `${server.origin}/`;

      const websiteResult = await analyzeWebsitePlugin.execute({ type: 'analyzeWebsite', url });
      const uxResult = await reviewUxPlugin.execute({ type: 'reviewUx', url, confirmed: true });
      const marketingResult = await analyzeMarketingPlugin.execute({ type: 'analyzeMarketing', url, confirmed: true });

      expect(websiteResult.ok).toBe(true);
      expect(uxResult.ok).toBe(true);
      expect(marketingResult.ok).toBe(true);
      if (!websiteResult.ok || !uxResult.ok || !marketingResult.ok) return;

      const websiteReport = websiteResult.data as IntelligenceReport<WebsiteReportFields>;
      const uxReport = uxResult.data as IntelligenceReport<UxReportFields>;
      const marketingReport = marketingResult.data as IntelligenceReport<MarketingReportFields>;

      // Real gaps really found on the real fixture page — not asserting exact wording, just that
      // the honest scope-limited detectors actually fired off real missing tags.
      expect(websiteReport.findings.some((f) => /meta description|<title>/i.test(f.statement))).toBe(true);
      expect(marketingReport.findings.some((f) => /Open Graph/i.test(f.statement))).toBe(true);

      const productResult = await scoreProductPlugin.execute({ type: 'scoreProduct', url });
      expect(productResult.ok).toBe(true);
      if (!productResult.ok) return;
      const productReport = productResult.data as IntelligenceReport<ProductReportFields>;

      expect(productReport.domain.domainsAnalyzed).toEqual(expect.arrayContaining(['website', 'ux', 'marketing']));
      expect(productReport.domain.domainsMissing).not.toContain('website');
      expect(productReport.domain.domainsMissing).not.toContain('ux');
      expect(productReport.domain.domainsMissing).not.toContain('marketing');

      // The cross-domain inferred finding requires a real website SEO gap AND a real marketing
      // social-tag gap on the same subject — both are real here, so it must actually fire.
      const crossDomainFinding = productReport.findings.find((f) => /broader content\/metadata investment gap/i.test(f.statement));
      expect(crossDomainFinding).toBeDefined();
      expect(crossDomainFinding?.provenance).toBe('inferred');

      const founderResult = await askFounderAdvisorPlugin.execute({ type: 'askFounderAdvisor', url });
      expect(founderResult.ok).toBe(true);
      if (!founderResult.ok) return;
      const founderReport = founderResult.data as IntelligenceReport<FounderReportFields>;

      // Provenance-preservation invariant: Founder's "top priority" must be traceable back to one
      // real, unmodified finding from an underlying domain report — same severity, same confidence,
      // same provenance as when that finding was originally produced, never re-scored in transit.
      const topPriorityFinding = founderReport.findings.find((f) => f.statement.startsWith('Top priority across analyzed domains:'));
      expect(topPriorityFinding).toBeDefined();
      if (!topPriorityFinding) return;

      const candidates = [
        ...websiteReport.findings.map((finding) => ({ domain: 'website', finding })),
        ...uxReport.findings.map((finding) => ({ domain: 'ux', finding })),
        ...marketingReport.findings.map((finding) => ({ domain: 'marketing', finding })),
      ].filter((c) => c.finding.category === 'risk' || c.finding.category === 'gap');

      const originalMatch = candidates.find(
        (c) => `Top priority across analyzed domains: [${c.domain}] ${c.finding.statement}` === topPriorityFinding.statement,
      );
      expect(originalMatch).toBeDefined();
      expect(originalMatch?.finding.severity).toBe(topPriorityFinding.severity);
      expect(originalMatch?.finding.confidence).toBe(topPriorityFinding.confidence);
      expect(originalMatch?.finding.provenance).toBe(topPriorityFinding.provenance);

      // And it must genuinely be the highest-severity risk/gap finding across all three domains —
      // not an arbitrary pick.
      const maxRank = Math.max(...candidates.map((c) => SEVERITY_RANK[c.finding.severity]));
      expect(SEVERITY_RANK[topPriorityFinding.severity]).toBe(maxRank);

      expect(founderReport.domain.topPriority?.statement).toBe(topPriorityFinding.statement);
    }, 30_000);
  });

  describe('Repository -> Product -> Execution Planner, over one real temp repo', () => {
    it('runs the full real analyze -> aggregate -> plan pipeline using the real persisted finding id, never a fabricated one', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-cross-engine-repo-'));
      try {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'cross-engine-repo', scripts: {} }));

        const repoResult = await analyzeRepositoryPlugin.execute({ type: 'analyzeRepository', repoPath: dir });
        expect(repoResult.ok).toBe(true);
        if (!repoResult.ok) return;
        const repoReport = repoResult.data as IntelligenceReport<RepositoryReportFields>;
        expect(repoReport.domain.hasTests).toBe(false);
        expect(repoReport.domain.packageManager).toBe('npm');

        const productResult = await scoreProductPlugin.execute({ type: 'scoreProduct', repoPath: dir });
        expect(productResult.ok).toBe(true);
        if (!productResult.ok) return;
        const productReport = productResult.data as IntelligenceReport<ProductReportFields>;
        expect(productReport.domain.domainsAnalyzed).toEqual(['repository']);

        // The real finding id read back from the real persisted report — never hardcoded/fabricated.
        const missingTestsFinding = repoReport.findings.find((f) => f.evidenceRefs.includes('context.hasTests'));
        expect(missingTestsFinding).toBeDefined();
        if (!missingTestsFinding) return;

        const planResult = await proposeExecutionPlanPlugin.execute({
          type: 'proposeExecutionPlan',
          engineId: 'repository',
          subject: dir,
          approvedFindingIds: [missingTestsFinding.id],
        });
        expect(planResult.ok).toBe(true);
        if (!planResult.ok) return;
        const plan = planResult.data as ExecutionPlan;

        expect(plan.approvalRequired).toBe(true);
        expect(plan.steps).toHaveLength(1);
        expect(plan.unplannableFindingIds).toHaveLength(0);
        const step = plan.steps[0]!;
        expect(step.findingRefs).toEqual([missingTestsFinding.id]);
        expect(step.status).toBe('proposed');
        expect(step.actionRequest).toEqual({ type: 'runCommand', command: 'npm install --save-dev vitest', cwd: repoReport.domain.repoPath });
        expect(step.rationale).toContain(repoReport.domain.workspaceName);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }, 30_000);
  });
});
