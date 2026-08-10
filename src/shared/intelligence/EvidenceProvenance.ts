/**
 * Same vocabulary as MemoryGraphStore's EvidenceSource (src/main/memory/MemoryGraphStore.ts) —
 * duplicated here rather than imported so this shared/ module never depends on a main-process-only
 * file. Keep the two in sync if either grows a new source kind.
 */
export type EvidenceSource = 'fileContent' | 'userAction' | 'conversation' | 'taskExecution' | 'userConfirmation';

/**
 * What kind of fact this is, before any confidence-scoring is applied.
 * Distinct from EvidenceItem.source (WHERE the fact came from mechanically)
 * and from a Finding's confidence (HOW SURE we are) — this is WHETHER the
 * fact was actually seen at all, or whether seeing it would require access
 * PawOS doesn't currently have. Never conflated with confidence: an
 * 'inferred' fact can still carry high confidence (a strong pattern-match),
 * and an 'observed' fact can carry low confidence (an ambiguous screenshot).
 */
export type EvidenceProvenance =
  | 'observed'
  | 'inferred'
  | 'requiresRepositoryAccess'
  | 'requiresApiAccess'
  | 'requiresInternalDocumentation';

/** One evidence item gathered during an Intelligence analysis, tagged with its provenance at collection time — never upgraded afterward by a correlation rule. */
export type ProvenancedEvidenceItem = {
  provenance: EvidenceProvenance;
  /** Same EvidenceSource vocabulary MemoryGraphStore already uses — additive, not a replacement. */
  source: EvidenceSource;
  detail: string;
  refId?: string;
};
