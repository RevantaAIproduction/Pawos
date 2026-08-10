import type { EvidenceProvenance } from './EvidenceProvenance';

export type FindingConfidence = 'low' | 'medium' | 'high';
export type FindingSeverity = 'info' | 'minor' | 'moderate' | 'major' | 'critical';
export type FindingCategory = 'strength' | 'gap' | 'risk' | 'opportunity';

/**
 * One scored, evidence-linked claim produced by a CorrelationRule. Two
 * independent axes on purpose (rootCauseEngine.ts's RootCauseCandidate
 * conflates "how sure" and "how good/bad" into one enum — Intelligence
 * findings need both separately, e.g. "no rate limiting observed" can be
 * severity 'major' while confidence stays 'medium' since absence-of-evidence
 * isn't fully conclusive without repository access).
 */
export type Finding = {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  /** The human-readable claim, e.g. "No responsive breakpoints detected below 768px." */
  statement: string;
  /** Pointers into the evidence set this finding is grounded in — same discipline as RootCauseCandidate.evidenceRefs, never fabricated. */
  evidenceRefs: string[];
  provenance: EvidenceProvenance;
};

/**
 * The fixed-shape output of any Intelligence engine (Website/Repository/
 * Product/UX/Marketing), assembled only from already-gathered evidence and
 * already-computed findings — never a fresh guess at assembly time, same
 * discipline as buildEngineeringReport(). `domain` carries whatever
 * engine-specific fields that engine's own ReportBuilder contributes.
 */
export type IntelligenceReport<TDomainFields = Record<string, unknown>> = {
  engineId: 'website' | 'repository' | 'product' | 'ux' | 'marketing' | 'founder';
  subject: string;
  generatedAt: number;
  /** Pure aggregation over findings (weighted by severity) — never a separately-generated number. Absent when the engine has no meaningful single score. */
  overallScore?: number;
  findings: Finding[];
  /** Synthesized by joining findings' statements — never raw LLM prose, same discipline as MemoryGraphStore's buildReasoningSummary. */
  observedSummary: string;
  /** Explicit "to go further I would need X" list, drawn from findings whose provenance is one of the requires* values. */
  requiresAccessSummary: string[];
  domain: TDomainFields;
  /** Always false — this is read-only analysis, never an action needing confirmation. Execution proposals are a separate ExecutionPlan artifact (see ExecutionPlanner). */
  approvalRequired: false;
};

/** Groups a report's findings by provenance for UI rendering — the concrete mechanism that keeps "what Paw actually saw" visibly separate from "what Paw is guessing" and "what Paw couldn't check." */
export function groupFindingsByProvenance(findings: Finding[]): Record<EvidenceProvenance, Finding[]> {
  const groups: Record<EvidenceProvenance, Finding[]> = {
    observed: [],
    inferred: [],
    requiresRepositoryAccess: [],
    requiresApiAccess: [],
    requiresInternalDocumentation: [],
  };
  for (const finding of findings) {
    groups[finding.provenance].push(finding);
  }
  return groups;
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { info: 0, minor: 1, moderate: 2, major: 4, critical: 8 };

/**
 * Pure aggregation over findings — "why this score" is always traceable back
 * to specific findings, never a separately-generated LLM number. Findings
 * whose provenance is 'requiresRepositoryAccess'/'requiresApiAccess'/
 * 'requiresInternalDocumentation' are excluded from scoring entirely (a gap
 * in what Paw could check isn't evidence the product is bad), matching the
 * anti-hallucination discipline: only what was actually observed or safely
 * inferred should move the number.
 */
export function computeOverallScore(findings: Finding[]): number {
  const scored = findings.filter((f) => f.provenance === 'observed' || f.provenance === 'inferred');
  if (scored.length === 0) return 100;
  const penalty = scored
    .filter((f) => f.category === 'gap' || f.category === 'risk')
    .reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  return Math.max(0, Math.round(100 - penalty));
}
