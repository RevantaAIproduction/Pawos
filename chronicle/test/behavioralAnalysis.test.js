import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { analyzeDeveloperBehavior } from "../src/analysis/behavioralAnalysis.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const projectId = hash("behavior-project");
function event(source, sequence, type, extra = {}) {
  return {
    schemaVersion: 1, eventId: hash(`${source}:${sequence}:${type}`), sessionId: hash(`${source}:session`), sourceAdapter: source, sourceAdapterVersion: "fixture",
    sequence, sourceSequence: sequence, timestamp: null, timestampPrecision: "unknown", type,
    actor: type === "user_prompt" || type === "developer_correction" ? "user" : "assistant", toolIdentity: null, toolCategory: null,
    parentEventId: null, parentSessionId: null, relationshipId: null, modelIdentifier: null, repositoryIdentity: projectId,
    worktreeIdentity: hash(`${source}:worktree`), signals: [], outcome: "none", attribution: "observed", confidence: "high",
    provenance: { recordType: `${source}.fixture`, recordReference: hash(`${source}:record:${sequence}`) }, ...extra,
  };
}
function report(sessions, commitIds = []) {
  return { project: { localProjectId: projectId }, git: { commitIds }, agents: { sessions } };
}
function bySignal(result, signal) { return result.observations.find((item) => item.signal === signal); }

test("separates explicit plans from lexical planning language and marks decomposition unavailable", () => {
  const plan = event("codex", 0, "plan_create", { provenance: { recordType: "event_msg.plan_create", recordReference: hash("plan-record") } });
  const language = event("claude-code", 1, "user_prompt", { signals: ["planning_language"] });
  const result = analyzeDeveloperBehavior(report([
    { sessionKey: plan.sessionId, source: "codex", events: [plan], sequenceSummary: { evidenceRefs: [plan.eventId] } },
    { sessionKey: language.sessionId, source: "claude-code", events: [language], sequenceSummary: { evidenceRefs: [language.eventId] } },
  ]));
  assert.equal(bySignal(result, "explicit_plan_events").evidenceClassification, "confirmed");
  assert.equal(bySignal(result, "planning_language").evidenceClassification, "heuristic");
  assert.equal(bySignal(result, "task_decomposition_unavailable").evidenceClassification, "unavailable");
  assert.match(bySignal(result, "explicit_plan_events").limitations, /plan content/);
});

test("describes correction followed by action without claiming the action resolved it", () => {
  const correction = event("gemini-cli", 0, "developer_correction", { signals: ["correction_language"], confidence: "low" });
  const action = event("gemini-cli", 1, "tool_call", { toolIdentity: "Edit", toolCategory: "file_edit" });
  const result = analyzeDeveloperBehavior(report([{ sessionKey: correction.sessionId, source: "gemini-cli", events: [correction, action], timelineAnalysis: { correctionFollowUps: [{ correctionEventId: correction.eventId, followUpEventId: action.eventId }] }, sequenceSummary: { evidenceRefs: [correction.eventId, action.eventId] } }]));
  assert.equal(bySignal(result, "correction_language").evidenceClassification, "heuristic");
  assert.equal(bySignal(result, "correction_followups").evidenceCount, 1);
  assert.match(bySignal(result, "correction_followups").limitations, /does not prove/);
});

test("reports verification tool attempts separately from explicit outcomes", () => {
  const call = event("codex", 0, "tool_call", { toolIdentity: "npm.test", toolCategory: "verification" });
  const resultEvent = event("codex", 1, "tool_result", { parentEventId: call.eventId, outcome: "success" });
  const result = analyzeDeveloperBehavior(report([{ sessionKey: call.sessionId, source: "codex", events: [call, resultEvent], sequenceSummary: { evidenceRefs: [call.eventId, resultEvent.eventId] } }]));
  assert.equal(bySignal(result, "verification_attempt").evidenceClassification, "heuristic");
  assert.equal(bySignal(result, "verification_result").evidenceClassification, "heuristic");
  assert.match(bySignal(result, "verification_result").limitations, /not independently validated/);
});

test("keeps later success as probable, not proof of recovery or completion", () => {
  const failure = event("claude-code", 0, "error", { outcome: "failure" });
  const recovery = event("claude-code", 1, "recovery", { outcome: "success", attribution: "inferred", confidence: "medium" });
  const result = analyzeDeveloperBehavior(report([{ sessionKey: failure.sessionId, source: "claude-code", events: [failure, recovery], sequenceSummary: { evidenceRefs: [failure.eventId, recovery.eventId] } }]));
  assert.equal(bySignal(result, "failure_events").evidenceClassification, "confirmed");
  assert.equal(bySignal(result, "later_success_signals").evidenceClassification, "probable");
  assert.match(bySignal(result, "later_success_signals").limitations, /task completion/);
});

test("includes only explicit orchestration and background lifecycle records", () => {
  const dispatch = event("codex", 0, "subagent_dispatch");
  const start = event("codex", 1, "background_execution_start");
  const result = analyzeDeveloperBehavior(report([{ sessionKey: dispatch.sessionId, source: "codex", events: [dispatch, start], sequenceSummary: { evidenceRefs: [dispatch.eventId, start.eventId] } }]));
  assert.equal(bySignal(result, "explicit_orchestration").evidenceCount, 1);
  assert.equal(bySignal(result, "explicit_background_lifecycle").evidenceCount, 1);
  assert.equal(bySignal(result, "orchestration_unavailable"), undefined);
});

test("keeps Git activity separate from AI sessions and leaves authorship unavailable", () => {
  const ai = event("claude-code", 0, "tool_call");
  const commit = hash("commit-1");
  const result = analyzeDeveloperBehavior(report([{ sessionKey: ai.sessionId, source: "claude-code", events: [ai], sequenceSummary: { evidenceRefs: [ai.eventId] } }], [commit]));
  assert.equal(bySignal(result, "ai_session_activity").evidenceCount, 1);
  assert.equal(bySignal(result, "git_activity_only").evidenceCount, 1);
  assert.equal(bySignal(result, "authorship_unavailable"), undefined);
  assert.deepEqual(bySignal(result, "git_activity_only").provenance, [{ sourceAdapter: "git", recordTypes: ["git_commit_metadata"] }]);
  assert.equal(bySignal(result, "manual_authorship_unavailable").evidenceClassification, "unavailable");
  assert.equal(bySignal(result, "ai_authorship_unavailable").evidenceClassification, "unavailable");
  assert.equal(bySignal(result, "hybrid_authorship_unavailable").evidenceClassification, "unavailable");
  assert.deepEqual(bySignal(result, "git_activity_only").evidenceRefs, [commit]);
});

test("uses product wording only as a lexical heuristic and never retains prompt text", () => {
  const prompt = event("gemini-cli", 0, "user_prompt", { signals: ["product_context_language"] });
  const result = analyzeDeveloperBehavior(report([{ sessionKey: prompt.sessionId, source: "gemini-cli", events: [prompt], sequenceSummary: { evidenceRefs: [prompt.eventId] } }]));
  assert.equal(bySignal(result, "product_language").evidenceClassification, "heuristic");
  assert.equal(bySignal(result, "product_decisions_unavailable").evidenceClassification, "unavailable");
  assert.doesNotMatch(JSON.stringify(result), /RawCustomerPhraseFixture|SecretPromptFixture/);
});

test("produces deterministic identifiers and only opaque, bounded evidence", () => {
  const sourceEvent = event("claude-code", 0, "tool_call");
  const input = report([{ sessionKey: sourceEvent.sessionId, source: "claude-code", events: [sourceEvent], sequenceSummary: { evidenceRefs: [sourceEvent.eventId] } }], [hash("commit")]);
  const first = analyzeDeveloperBehavior(input);
  assert.deepEqual(analyzeDeveloperBehavior(input), first);
  for (const item of first.observations) {
    assert.match(item.observationId, /^[a-f0-9]{64}$/);
    assert.ok(item.evidenceRefs.length <= 32);
    assert.ok(item.provenance.length >= 1);
    assert.ok(["confirmed", "probable", "heuristic", "unavailable"].includes(item.evidenceClassification));
    assert.equal(Object.hasOwn(item, "rawPrompt"), false);
    assert.equal(item.verificationStatus, "locally_generated");
    assert.equal(item.evidenceCoverage.referencesIncluded, item.evidenceRefs.length);
    assert.equal(item.evidenceCoverage.omitted, Math.max(0, item.evidenceCoverage.totalAvailable - item.evidenceRefs.length));
    assert.equal(item.evidenceCoverage.truncated, item.evidenceCoverage.omitted > 0);
  }
});

test("marks bounded Git references as truncated while retaining the full evidence total", () => {
  const commits = Array.from({ length: 405 }, (_, index) => hash(`commit-${index}`));
  const git = bySignal(analyzeDeveloperBehavior(report([], commits)), "git_activity_only");
  assert.equal(git.evidenceCount, 405);
  assert.equal(git.evidenceCoverage.totalAvailable, 405);
  assert.equal(git.evidenceCoverage.referencesIncluded, 32);
  assert.equal(git.evidenceCoverage.omitted, 373);
  assert.equal(git.evidenceCoverage.truncated, true);
  assert.equal(git.evidenceCoverage.coveragePercent, 7.9);
});

test("distinguishes unapproved session evidence from absent evidence", () => {
  const notApproved = report([]);
  notApproved.sourceAvailability = { agentSessions: "partial" };
  notApproved.agents.claim = "Supported source locations were found but not approved for transcript reading.";
  assert.equal(bySignal(analyzeDeveloperBehavior(notApproved), "task_decomposition_unavailable").evidenceCoverage.unavailableReason, "not_approved");
  const absent = report([]);
  absent.sourceAvailability = { agentSessions: "implemented" };
  absent.agents.claim = "No supported, repository-associated session records were included.";
  assert.equal(bySignal(analyzeDeveloperBehavior(absent), "task_decomposition_unavailable").evidenceCoverage.unavailableReason, "evidence_absent");
  const failed = report([]);
  failed.agents.claim = "One or more approved session sources could not be analyzed.";
  assert.equal(bySignal(analyzeDeveloperBehavior(failed), "task_decomposition_unavailable").evidenceCoverage.unavailableReason, "source_unavailable");
});
