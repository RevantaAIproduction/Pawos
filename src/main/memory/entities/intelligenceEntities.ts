import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';
import type { IntelligenceReport } from '../../../shared/intelligence/IntelligenceReportTypes';

/**
 * Intelligence Runtime's typed wrapper over the same generic Memory Graph
 * every other runtime writes into (see webEntities.ts/infrastructureEntities.ts
 * for the established precedent) — deliberately NOT a second bespoke store
 * like EngineeringMemoryStore.ts. Every IntelligenceReport (Website/
 * Repository/Product/UX/Marketing/Founder) persists as one
 * 'intelligenceReport' entity, versioned via the graph's own
 * entity.history[] — no separate JSON log, no duplicated querying.
 */

export type IntelligenceReportAttributes = {
  engineId: IntelligenceReport['engineId'];
  subject: string;
  report: IntelligenceReport;
};

function normalizeSubject(s: string): string {
  return s.trim().toLowerCase();
}

/** Finds the most recent report for a given engine + subject (e.g. "has this URL already had a Website Intelligence report?") — the read side of cross-engine, graph-mediated citation described in the architecture spec. */
export function findLatestIntelligenceReport(engineId: IntelligenceReport['engineId'], subject: string): Entity | undefined {
  const target = normalizeSubject(subject);
  const matches = memoryGraphStore.queryEntities({
    type: 'intelligenceReport',
    where: (a) => {
      const attrs = a as IntelligenceReportAttributes;
      return attrs.engineId === engineId && normalizeSubject(attrs.subject) === target;
    },
  });
  return matches.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/**
 * Persists a report — one entity per (engineId, subject) pair, updated in
 * place on re-analysis rather than duplicated, so entity.history[] gives
 * "how has this changed over time" for free. Optionally links the report to
 * the subject entity it was produced from (e.g. a 'websiteSite'/
 * 'repository'/'codingProject' entity) via RELATION.ANALYZED_AS, so
 * getRelated()/getProvenanceChain() surface it the same way every other
 * domain's provenance already works.
 */
export function recordIntelligenceReport(report: IntelligenceReport, subjectEntityId?: string): Entity {
  const existing = findLatestIntelligenceReport(report.engineId, report.subject);
  const attributes: IntelligenceReportAttributes = { engineId: report.engineId, subject: report.subject, report };
  const entity = memoryGraphStore.upsertEntity('intelligenceReport', attributes, {
    id: existing?.id,
    changeType: existing ? 'modified' : 'created',
  });

  if (subjectEntityId) {
    memoryGraphStore.link(subjectEntityId, entity.id, RELATION.ANALYZED_AS, {
      confidence: 1,
      evidence: [{ source: 'taskExecution', detail: `${report.engineId} Intelligence analysis produced a report for "${report.subject}".` }],
      reasoningSummary: `Analyzed as part of a ${report.engineId} Intelligence run.`,
    });
  }

  return entity;
}
