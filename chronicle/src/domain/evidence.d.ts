export type EvidenceClass = "confirmed" | "probable" | "configuration" | "unavailable";
export type EventKind = "project_detected" | "agent_session" | "agent_action" | "git_commit" | "test_configured" | "build_configured" | "ci_configured" | "test_run" | "build_run" | "lint_run" | "typecheck_run";
export interface ChronicleEventV1 {
  schemaVersion: 1;
  eventId: string;
  projectId: string;
  projectAssociation: "exact_root" | "explicitly_linked" | "probable" | "unlinked";
  source: { adapterId: string; adapterVersion: string; formatVersion?: string; sourceRecordId?: string; sourceFingerprint: string };
  kind: EventKind;
  occurredAt?: string;
  timePrecision?: "second" | "minute" | "day" | "unknown";
  sessionId?: string;
  actor: { kind: "human" | "agent" | "system" | "unknown"; label?: string; confidence: "high" | "medium" | "low" };
  evidence: { classification: EvidenceClass; basis: string[]; coverage?: { from?: string; to?: string; completeness: "partial" | "unknown" | "complete" } };
  privacy: { containsRawText: false; containsAbsolutePath: false; containsSecretMaterial: false };
}
