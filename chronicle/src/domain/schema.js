export const EVENT_SCHEMA_VERSION = 1;
const classifications = new Set(["confirmed", "probable", "configuration", "unavailable"]);
const kinds = new Set(["project_detected", "agent_session", "agent_action", "git_commit", "test_configured", "build_configured", "ci_configured", "test_run", "build_run", "lint_run", "typecheck_run"]);
const allowed = {
  root: new Set(["schemaVersion", "eventId", "projectId", "projectAssociation", "source", "kind", "occurredAt", "timePrecision", "sessionId", "actor", "agent", "activity", "outcome", "evidence", "metrics", "privacy"]),
  source: new Set(["adapterId", "adapterVersion", "formatVersion", "sourceRecordId", "sourceFingerprint"]),
  actor: new Set(["kind", "label", "confidence"]), evidence: new Set(["classification", "basis", "coverage"]),
  coverage: new Set(["from", "to", "completeness"]), privacy: new Set(["containsRawText", "containsAbsolutePath", "containsSecretMaterial"]),
  agent: new Set(["productId", "model", "version"]), metrics: new Set(["changedFileCount", "additions", "deletions", "durationSeconds"])
};
const extraKeys = (value, keys) => Object.keys(value).some(key => !keys.has(key));
const shortString = (value, max = 160) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\r\n\0]/.test(value);

export function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { ok: false, reason: "event_not_object" };
  if (Buffer.byteLength(JSON.stringify(event), "utf8") > 16_384) return { ok: false, reason: "event_too_large" };
  if (extraKeys(event, allowed.root)) return { ok: false, reason: "unknown_or_sensitive_field" };
  if (event.schemaVersion !== EVENT_SCHEMA_VERSION) return { ok: false, reason: "unsupported_schema_version" };
  if (!["eventId", "projectId", "projectAssociation"].every(key => shortString(event[key]))) return { ok: false, reason: "invalid_identity" };
  if (!["exact_root", "explicitly_linked", "probable", "unlinked"].includes(event.projectAssociation)) return { ok: false, reason: "invalid_project_association" };
  if (!kinds.has(event.kind)) return { ok: false, reason: "invalid_kind" };
  if (!event.source || extraKeys(event.source, allowed.source) || !["adapterId", "adapterVersion", "sourceFingerprint"].every(key => shortString(event.source[key]))) return { ok: false, reason: "invalid_source" };
  if (!event.actor || extraKeys(event.actor, allowed.actor) || !["human", "agent", "system", "unknown"].includes(event.actor.kind) || !["high", "medium", "low"].includes(event.actor.confidence) || (event.actor.label !== undefined && !shortString(event.actor.label))) return { ok: false, reason: "invalid_actor" };
  if (!event.evidence || extraKeys(event.evidence, allowed.evidence) || !classifications.has(event.evidence.classification) || !Array.isArray(event.evidence.basis) || event.evidence.basis.length > 32 || event.evidence.basis.some(x => typeof x !== "string" || !/^[a-z0-9_]{1,80}$/.test(x))) return { ok: false, reason: "invalid_evidence" };
  if (event.evidence.coverage && (extraKeys(event.evidence.coverage, allowed.coverage) || !["partial", "unknown", "complete"].includes(event.evidence.coverage.completeness))) return { ok: false, reason: "invalid_coverage" };
  if (event.agent && (extraKeys(event.agent, allowed.agent) || !shortString(event.agent.productId, 80))) return { ok: false, reason: "invalid_agent" };
  if (event.metrics && (extraKeys(event.metrics, allowed.metrics) || Object.values(event.metrics).some(v => !Number.isSafeInteger(v) || v < 0))) return { ok: false, reason: "invalid_metrics" };
  if (event.occurredAt !== undefined && (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt)))) return { ok: false, reason: "invalid_timestamp" };
  if (event.privacy?.containsRawText !== false || event.privacy?.containsAbsolutePath !== false || event.privacy?.containsSecretMaterial !== false) return { ok: false, reason: "privacy_invariant_failed" };
  if (extraKeys(event.privacy, allowed.privacy)) return { ok: false, reason: "privacy_invariant_failed" };
  return { ok: true };
}
