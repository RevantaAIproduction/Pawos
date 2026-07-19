/**
 * The Autonomous Engineering Loop's formal output shape — every field is
 * derived only from real evidence already gathered by investigationCore.ts
 * (main process); nothing here is invented at report-assembly time. Stored
 * verbatim on an EngineeringMemoryEntry (kind: 'engineeringReport') so a
 * future investigation can reference exactly what was concluded before,
 * not just that "something happened."
 */
export type EngineeringReport = {
  issueSummary: string;
  rootCause: string;
  evidence: string[];
  affectedServices: string[];
  /** Real file paths only — empty when this investigation didn't localize any, never a guess. */
  affectedFiles: string[];
  riskAssessment: string;
  validation: string;
  tests: string;
  deploymentRecommendation: string;
  rollbackPlan: string;
  /** Always true by architecture — any resulting fix/deploy/rollback still goes through its own gated confirmation. */
  approvalRequired: boolean;
};
