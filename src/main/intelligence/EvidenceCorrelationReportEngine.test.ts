import { describe, expect, it } from 'vitest';
import { correlate, assembleReport, type CorrelationRule, type ReportBuilder } from './EvidenceCorrelationReportEngine';
import type { Finding } from '../../shared/intelligence/IntelligenceReportTypes';

type FakeEvidence = {
  hasRateLimiting: boolean;
  usesFramework: string | null;
  hadRepositoryAccess: boolean;
};

const rateLimitingRule: CorrelationRule<FakeEvidence> = {
  id: 'rateLimiting',
  evaluate(evidence) {
    if (evidence.hasRateLimiting) return [];
    const findings: Omit<Finding, 'id'>[] = [
      {
        category: 'gap',
        severity: 'major',
        confidence: 'medium',
        statement: 'No rate limiting observed on the public API.',
        evidenceRefs: ['ev-1'],
        provenance: 'observed',
      },
    ];
    return findings;
  },
};

const frameworkInferenceRule: CorrelationRule<FakeEvidence> = {
  id: 'frameworkInference',
  evaluate(evidence) {
    if (!evidence.usesFramework) return [];
    return [
      {
        category: 'strength',
        severity: 'info',
        confidence: 'high',
        statement: `Likely uses ${evidence.usesFramework} based on folder structure.`,
        evidenceRefs: ['ev-2'],
        provenance: 'inferred',
      },
    ];
  },
};

const repoAccessGapRule: CorrelationRule<FakeEvidence> = {
  id: 'repoAccessGap',
  evaluate(evidence) {
    if (evidence.hadRepositoryAccess) return [];
    return [
      {
        category: 'gap',
        severity: 'info',
        confidence: 'low',
        statement: 'Bundle size could not be checked without repository access.',
        evidenceRefs: [],
        provenance: 'requiresRepositoryAccess',
      },
    ];
  },
};

type FakeDomainFields = { pagesAnalyzed: number };
const fakeReportBuilder: ReportBuilder<FakeEvidence, FakeDomainFields> = {
  build: () => ({ pagesAnalyzed: 1 }),
};

describe('EvidenceCorrelationReportEngine', () => {
  it('collects findings from every rule and sorts by severity then confidence', () => {
    const evidence: FakeEvidence = { hasRateLimiting: false, usesFramework: 'Next.js', hadRepositoryAccess: true };
    const findings = correlate(evidence, [rateLimitingRule, frameworkInferenceRule, repoAccessGapRule]);

    expect(findings).toHaveLength(2);
    expect(findings[0]?.statement).toBe('No rate limiting observed on the public API.');
    expect(findings[0]?.severity).toBe('major');
    expect(findings[1]?.statement).toContain('Next.js');
    expect(findings.every((f) => typeof f.id === 'string' && f.id.length > 0)).toBe(true);
  });

  it('never upgrades a rule-assigned provenance', () => {
    const evidence: FakeEvidence = { hasRateLimiting: true, usesFramework: null, hadRepositoryAccess: false };
    const findings = correlate(evidence, [rateLimitingRule, frameworkInferenceRule, repoAccessGapRule]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.provenance).toBe('requiresRepositoryAccess');
  });

  it('honestly emits a single info-level finding when every rule stays silent', () => {
    const evidence: FakeEvidence = { hasRateLimiting: true, usesFramework: null, hadRepositoryAccess: true };
    const findings = correlate(evidence, [rateLimitingRule, frameworkInferenceRule, repoAccessGapRule]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.statement).toMatch(/no strong correlating signal/i);
  });

  it('assembleReport wraps domain fields in the shared envelope and groups requires-access findings', () => {
    const evidence: FakeEvidence = { hasRateLimiting: false, usesFramework: 'Next.js', hadRepositoryAccess: false };
    const findings = correlate(evidence, [rateLimitingRule, frameworkInferenceRule, repoAccessGapRule]);
    const report = assembleReport('website', 'https://example.com', evidence, findings, fakeReportBuilder);

    expect(report.engineId).toBe('website');
    expect(report.subject).toBe('https://example.com');
    expect(report.approvalRequired).toBe(false);
    expect(report.domain).toEqual({ pagesAnalyzed: 1 });
    expect(report.requiresAccessSummary).toEqual(['Bundle size could not be checked without repository access.']);
    expect(report.observedSummary).toContain('No rate limiting observed');
    expect(report.observedSummary).toContain('Next.js');
    expect(typeof report.overallScore).toBe('number');
    expect(report.overallScore).toBeLessThan(100);
  });

  it('computeOverallScore is a pure aggregation excluding requires-access findings from the penalty', () => {
    const allAccessible: FakeEvidence = { hasRateLimiting: false, usesFramework: null, hadRepositoryAccess: true };
    const findings = correlate(allAccessible, [rateLimitingRule, frameworkInferenceRule, repoAccessGapRule]);
    const report = assembleReport('website', 'https://example.com', allAccessible, findings, fakeReportBuilder);

    // One 'major' gap (weight 4) is the only observed/inferred finding scored -> 100 - 4 = 96.
    expect(report.overallScore).toBe(96);
  });
});
