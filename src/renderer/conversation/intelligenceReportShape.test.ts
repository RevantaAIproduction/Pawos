import { describe, expect, it } from 'vitest';
import { getIntelligenceReport, getExecutionPlan } from './intelligenceReportShape';
import type { ConversationTaskAction } from './ConversationTypes';
import type { IntelligenceReport } from '../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../shared/intelligence/WebsiteReportTypes';
import type { ExecutionPlan } from '../../shared/actions/ExecutionLifecycle';

function makeAction(data: unknown, ok = true): ConversationTaskAction {
  return {
    id: 'a1',
    type: 'analyzeWebsite',
    request: { type: 'analyzeWebsite', url: 'https://example.com/' },
    result: { ok, data } as ConversationTaskAction['result'],
    startedAt: 0,
    endedAt: 1,
    inProgressText: '',
  };
}

function makeReport(): IntelligenceReport<WebsiteReportFields> {
  return {
    engineId: 'website',
    subject: 'https://example.com/',
    generatedAt: Date.now(),
    overallScore: 80,
    findings: [],
    observedSummary: 'ok',
    requiresAccessSummary: [],
    domain: {
      startUrl: 'https://example.com/',
      origin: 'https://example.com',
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

function makePlan(): ExecutionPlan {
  return {
    id: 'plan-1',
    sourceReportId: 'entity-1',
    steps: [],
    unplannableFindingIds: [],
    approvalRequired: true,
  };
}

describe('getIntelligenceReport', () => {
  it('recognizes a real IntelligenceReport shape', () => {
    const report = getIntelligenceReport(makeAction(makeReport()));
    expect(report?.engineId).toBe('website');
  });

  it('rejects data with no result', () => {
    const action: ConversationTaskAction = { ...makeAction(undefined), result: undefined };
    expect(getIntelligenceReport(action)).toBeUndefined();
  });

  it('rejects an unknown engineId', () => {
    const report = { ...makeReport(), engineId: 'unknown' as unknown as IntelligenceReport['engineId'] };
    expect(getIntelligenceReport(makeAction(report))).toBeUndefined();
  });

  it('rejects approvalRequired: true (that is an ExecutionPlan, not a report)', () => {
    const report = { ...makeReport(), approvalRequired: true as unknown as false };
    expect(getIntelligenceReport(makeAction(report))).toBeUndefined();
  });

  it('does not mistake a real ExecutionPlan for a report', () => {
    expect(getIntelligenceReport(makeAction(makePlan()))).toBeUndefined();
  });

  it('does not mistake an unrelated shape (e.g. BuildStatus) for a report', () => {
    expect(getIntelligenceReport(makeAction({ status: 'success' }))).toBeUndefined();
  });
});

describe('getExecutionPlan', () => {
  it('recognizes a real ExecutionPlan shape', () => {
    const plan = getExecutionPlan(makeAction(makePlan()));
    expect(plan?.sourceReportId).toBe('entity-1');
  });

  it('rejects approvalRequired: false (that is an IntelligenceReport, not a plan)', () => {
    expect(getExecutionPlan(makeAction(makeReport()))).toBeUndefined();
  });

  it('rejects a shape missing steps', () => {
    const malformed = { sourceReportId: 'x', approvalRequired: true, unplannableFindingIds: [] };
    expect(getExecutionPlan(makeAction(malformed))).toBeUndefined();
  });

  it('does not mistake an unrelated shape for a plan', () => {
    expect(getExecutionPlan(makeAction({ workflowName: 'x', plan: [] }))).toBeUndefined();
  });
});
