import { v4 as uuidv4 } from 'uuid';
import type {
  Finding,
  FindingSeverity,
  FindingConfidence,
  IntelligenceReport,
} from '../../shared/intelligence/IntelligenceReportTypes';
import { computeOverallScore } from '../../shared/intelligence/IntelligenceReportTypes';

/** Shared context every evidence-gatherer receives alongside its own input — deliberately minimal, extended per-engine via TEvidence itself rather than growing this shape. */
export type GatherContext = {
  subject: string;
};

export interface EvidenceGatherer<TEvidence> {
  gather(input: unknown, ctx: GatherContext): Promise<TEvidence>;
}

/**
 * One deterministic correlation rule over already-gathered evidence — the
 * exact shape of rootCauseEngine.ts's correlateRootCause() if-blocks,
 * generalized and made pluggable. `evaluate` is a pure function: never
 * re-fetches anything, never invents a finding it hasn't observed. `id`
 * (Finding's own id, not the rule's) is assigned by correlate(), not here,
 * so a rule can't accidentally collide with another rule's id.
 */
export interface CorrelationRule<TEvidence> {
  id: string;
  evaluate(evidence: TEvidence): Omit<Finding, 'id'>[];
}

export interface ReportBuilder<TEvidence, TDomainFields> {
  build(subject: string, evidence: TEvidence, findings: Finding[]): TDomainFields;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 4, major: 3, moderate: 2, minor: 1, info: 0 };
const CONFIDENCE_RANK: Record<FindingConfidence, number> = { high: 2, medium: 1, low: 0 };

/**
 * Runs every rule over already-gathered evidence and collects the resulting
 * findings — the exact mechanics rootCauseEngine.ts's correlateRootCause()
 * already established (never re-fetches, never invents a finding it hasn't
 * observed), generalized into a reusable, parameterized function so every
 * Intelligence engine (Website/Repository/Product/UX/Marketing) shares this
 * one implementation instead of five copies. Sorted by (severity desc,
 * confidence desc); if every rule stays silent, honestly emits a single
 * info-level "no strong signal found" finding rather than forcing a guess.
 */
export function correlate<TEvidence>(evidence: TEvidence, rules: CorrelationRule<TEvidence>[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    for (const partial of rule.evaluate(evidence)) {
      findings.push({ id: uuidv4(), ...partial });
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: uuidv4(),
      category: 'gap',
      severity: 'info',
      confidence: 'low',
      statement: 'No strong correlating signal found from the gathered evidence.',
      evidenceRefs: [],
      provenance: 'observed',
    });
  }

  return findings.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return severityDiff !== 0 ? severityDiff : CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  });
}

/**
 * Wraps a ReportBuilder's domain-specific fields in the shared
 * IntelligenceReport envelope — the ONE place every report gets its common
 * fields (score, observed/requires-access summaries, generatedAt, engineId),
 * so none of the five engines duplicate this logic. Each engine supplies
 * only its own EvidenceGatherer, CorrelationRule[], and ReportBuilder;
 * nothing about gathering/correlating/assembling mechanics is reimplemented
 * per engine.
 */
export function assembleReport<TEvidence, TDomainFields>(
  engineId: IntelligenceReport['engineId'],
  subject: string,
  evidence: TEvidence,
  findings: Finding[],
  builder: ReportBuilder<TEvidence, TDomainFields>
): IntelligenceReport<TDomainFields> {
  const requiresAccessSummary = findings
    .filter(
      (f) =>
        f.provenance === 'requiresRepositoryAccess' ||
        f.provenance === 'requiresApiAccess' ||
        f.provenance === 'requiresInternalDocumentation'
    )
    .map((f) => f.statement);

  return {
    engineId,
    subject,
    generatedAt: Date.now(),
    overallScore: computeOverallScore(findings),
    findings,
    observedSummary: buildObservedSummary(findings),
    requiresAccessSummary,
    domain: builder.build(subject, evidence, findings),
    approvalRequired: false,
  };
}

/** Synthesized by joining findings' own statements — never raw LLM prose, same discipline as MemoryGraphStore's buildReasoningSummary. */
function buildObservedSummary(findings: Finding[]): string {
  const observed = findings.filter((f) => f.provenance === 'observed' || f.provenance === 'inferred');
  if (observed.length === 0) return 'No directly observed or inferred findings.';
  return observed.map((f) => f.statement).join(' ');
}
