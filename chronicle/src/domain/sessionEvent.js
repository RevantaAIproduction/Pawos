import { createHash } from "node:crypto";

export const SESSION_EVENT_SCHEMA_VERSION = 1;
export const MAX_NORMALIZED_EVENTS_PER_SESSION = 3_000;
const EVENT_TYPES = new Set([
  "session_start", "session_end", "user_prompt", "assistant_response", "tool_call", "tool_result",
  "model_change", "plan_create", "plan_update", "developer_correction", "subagent_dispatch",
  "subagent_return", "background_execution_start", "background_execution_end", "inter_agent_message", "error", "recovery",
]);
const ACTORS = new Set(["user", "assistant", "tool", "subagent", "system"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const OUTCOMES = new Set(["none", "success", "failure", "unknown"]);
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const safeTool = (value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(value) ? value : null;

export function timestampPrecision(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "unknown";
  if (/\.\d{3,}(?:Z|[+-]\d\d:\d\d)?$/i.test(value)) return "millisecond";
  return /:\d{2}(?:Z|[+-]\d\d:\d\d)?$/i.test(value) ? "second" : "unknown";
}

/** Makes privacy-safe events with deterministic opaque references; raw payloads are never accepted here. */
export function createSessionEventNormalizer({ adapterId, adapterVersion, rawSessionId, sessionKey, projectId, repositoryIdentity, worktreePath }) {
  const events = [];
  const seen = new Set();
  const worktreeIdentity = hash(`worktree\0${String(worktreePath || "").replaceAll("\\", "/").replace(/\/$/, "").toLowerCase()}`);
  return {
    add(input) {
      if (events.length >= MAX_NORMALIZED_EVENTS_PER_SESSION) return null;
      if (!input || !EVENT_TYPES.has(input.type) || !ACTORS.has(input.actor)) return null;
      const identity = input.sourceRecordId
        ? `${adapterId}\0${rawSessionId}\0${input.sourceRecordId}\0${input.type}`
        : `${adapterId}\0${rawSessionId}\0${input.sourceSequence}\0${input.type}\0${input.toolIdentity || ""}`;
      const eventId = hash(identity);
      if (seen.has(eventId)) return events.find((event) => event.eventId === eventId) || null;
      seen.add(eventId);
      const validTimestamp = typeof input.timestamp === "string" && Number.isFinite(Date.parse(input.timestamp)) ? new Date(input.timestamp).toISOString() : null;
      const event = {
        schemaVersion: SESSION_EVENT_SCHEMA_VERSION,
        eventId,
        sessionId: sessionKey,
        sourceAdapter: adapterId,
        sourceAdapterVersion: adapterVersion,
        sequence: events.length,
        sourceSequence: Number.isSafeInteger(input.sourceSequence) && input.sourceSequence >= 0 ? input.sourceSequence : events.length,
        timestamp: validTimestamp,
        timestampPrecision: timestampPrecision(input.timestamp),
        type: input.type,
        actor: input.actor,
        toolIdentity: safeTool(input.toolIdentity),
        toolCategory: typeof input.toolCategory === "string" && /^[a-z_]{1,32}$/.test(input.toolCategory) ? input.toolCategory : null,
        parentEventId: typeof input.parentEventId === "string" && /^[a-f0-9]{64}$/.test(input.parentEventId) ? input.parentEventId : null,
        parentSessionId: typeof input.parentSessionId === "string" && /^[a-f0-9]{64}$/.test(input.parentSessionId) ? input.parentSessionId : null,
        relationshipId: typeof input.relationshipId === "string" ? hash(`${adapterId}\0${rawSessionId}\0relation\0${input.relationshipId}`) : null,
        modelIdentifier: safeTool(input.modelIdentifier),
        repositoryIdentity: projectId || hash(`repo\0${repositoryIdentity || "unknown"}`),
        worktreeIdentity,
        signals: Array.isArray(input.signals) ? [...new Set(input.signals.filter((item) => /^[a-z_]{1,48}$/.test(item)))].slice(0, 8) : [],
        outcome: OUTCOMES.has(input.outcome) ? input.outcome : "none",
        attribution: input.attribution === "observed" || input.attribution === "inferred" ? input.attribution : "unknown",
        confidence: CONFIDENCE.has(input.confidence) ? input.confidence : "medium",
        provenance: {
          recordType: typeof input.sourceRecordType === "string" && /^[a-zA-Z0-9_.:-]{1,64}$/.test(input.sourceRecordType) ? input.sourceRecordType : "unknown",
          recordReference: hash(identity),
        },
      };
      events.push(event);
      return event;
    },
    list() { return events; },
    truncated() { return events.length >= MAX_NORMALIZED_EVENTS_PER_SESSION; },
  };
}

export function validateSessionEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { ok: false, reason: "event_not_object" };
  const required = ["schemaVersion", "eventId", "sessionId", "sourceAdapter", "sourceAdapterVersion", "sequence", "sourceSequence", "timestamp", "timestampPrecision", "type", "actor", "toolIdentity", "toolCategory", "parentEventId", "parentSessionId", "relationshipId", "modelIdentifier", "repositoryIdentity", "worktreeIdentity", "signals", "outcome", "attribution", "confidence", "provenance"];
  if (Object.keys(event).length !== required.length || required.some((key) => !Object.hasOwn(event, key))) return { ok: false, reason: "event_shape_invalid" };
  if (event.schemaVersion !== SESSION_EVENT_SCHEMA_VERSION || !/^[a-f0-9]{64}$/.test(event.eventId) || !/^[a-f0-9]{64}$/.test(event.sessionId)) return { ok: false, reason: "event_identity_invalid" };
  if (!EVENT_TYPES.has(event.type) || !ACTORS.has(event.actor) || !CONFIDENCE.has(event.confidence) || !OUTCOMES.has(event.outcome) || !["observed", "inferred", "unknown"].includes(event.attribution)) return { ok: false, reason: "event_classification_invalid" };
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0 || !Number.isSafeInteger(event.sourceSequence) || event.sourceSequence < 0) return { ok: false, reason: "event_order_invalid" };
  if (event.timestamp !== null && (typeof event.timestamp !== "string" || !Number.isFinite(Date.parse(event.timestamp)))) return { ok: false, reason: "event_timestamp_invalid" };
  if (!["millisecond", "second", "unknown"].includes(event.timestampPrecision)) return { ok: false, reason: "event_precision_invalid" };
  if (!/^[a-f0-9]{64}$/.test(event.repositoryIdentity) || !/^[a-f0-9]{64}$/.test(event.worktreeIdentity)) return { ok: false, reason: "event_project_identity_invalid" };
  if (!Array.isArray(event.signals) || event.signals.some((item) => typeof item !== "string" || !/^[a-z_]{1,48}$/.test(item))) return { ok: false, reason: "event_signals_invalid" };
  if (typeof event.provenance?.recordType !== "string" || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(event.provenance.recordType) || !/^[a-f0-9]{64}$/.test(event.provenance.recordReference)) return { ok: false, reason: "event_provenance_invalid" };
  const serialized = JSON.stringify(event);
  if (/rawPrompt|toolArgs|transcriptText|sourcePath|PRIVATE_|SECRET|TOKEN/i.test(serialized) || Buffer.byteLength(serialized) > 4_096) return { ok: false, reason: "event_privacy_or_size_invalid" };
  return { ok: true };
}
