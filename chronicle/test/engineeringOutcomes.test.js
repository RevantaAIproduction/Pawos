import test from "node:test";
import assert from "node:assert/strict";
import { analyzeEngineeringOutcomes } from "../src/analysis/engineeringOutcomes.js";

const h = (char) => char.repeat(64);
function ev({ id, sourceAdapter = "codex", type, sequence, parentEventId = null, outcome = "none", recordType = "response_item.local_shell_call", toolCategory = null, confidence, signals = [] }) {
  return { eventId: h(id), sessionId: h("s"), sourceAdapter, sequence, type, parentEventId, outcome, toolCategory, confidence, signals, provenance: { recordType } };
}
const base = (events = [], commitIds = []) => ({ project: { localProjectId: h("p") }, agents: { sessions: [{ sessionKey: h("s"), source: "codex", events, relatedCommitReferences: [] }] }, git: { commitIds }, episodes: [] });

test("direct tool results record tool execution only, never a test/build verification pass", () => {
  const call = ev({ id: "1", type: "tool_call", sequence: 1, toolCategory: "verification" });
  const result = ev({ id: "2", type: "tool_result", sequence: 2, parentEventId: call.eventId, outcome: "success", recordType: "event_msg.exec_command_end" });
  const [outcome] = analyzeEngineeringOutcomes(base([call, result]));
  assert.equal(outcome.category, "tool_execution");
  assert.equal(outcome.state, "passed");
  assert.equal(outcome.relationshipType, "direct_reference");
  assert.match(outcome.limitations, /does not establish that a test, build/);
  assert.doesNotMatch(outcome.category, /verification/);
});

test("failed and unknown tool outcomes stay distinct; missing cancellation/result remains absent", () => {
  const call = ev({ id: "3", type: "tool_call", sequence: 1 });
  const failed = ev({ id: "4", type: "tool_result", sequence: 2, parentEventId: call.eventId, outcome: "failure" });
  const unknown = ev({ id: "5", type: "tool_result", sequence: 3, parentEventId: call.eventId, outcome: "unknown" });
  const result = analyzeEngineeringOutcomes(base([call, failed, unknown]));
  assert.deepEqual(result.map((item) => item.state).sort(), ["failed", "unknown"]);
  assert.equal(result.find((item) => item.state === "unknown").evidenceClassification, "unavailable");
});

test("corrections distinguish an observed follow-up sequence from resolution", () => {
  const correction = ev({ id: "6", type: "developer_correction", sequence: 1, recordType: "user" });
  const response = ev({ id: "7", type: "assistant_response", sequence: 2, recordType: "assistant" });
  const responded = analyzeEngineeringOutcomes(base([correction, response])).find((item) => item.category === "correction");
  assert.equal(responded.state, "response_observed");
  assert.equal(responded.relationshipType, "inferred_association");
  assert.match(responded.limitations, /whether the correction was addressed/);
  const unresolved = analyzeEngineeringOutcomes(base([correction])).find((item) => item.category === "correction");
  assert.equal(unresolved.state, "unresolved");
  const lexicalCorrection = ev({ id: "8", type: "developer_correction", sequence: 1, recordType: "user", confidence: "low", signals: ["correction_language"] });
  const heuristic = analyzeEngineeringOutcomes(base([lexicalCorrection])).find((item) => item.category === "correction");
  assert.equal(heuristic.evidenceClassification, "heuristic");
  assert.equal(heuristic.confidence, "low");
});

test("explicit Codex plans distinguish creation and revision without implying completion or deviation", () => {
  const create = ev({ id: "8", type: "plan_create", sequence: 1, recordType: "event_msg.plan_create" });
  const update = ev({ id: "9", type: "plan_update", sequence: 2, recordType: "event_msg.plan_update" });
  const outcomes = analyzeEngineeringOutcomes(base([create, update])).filter((item) => item.category === "plan_lifecycle");
  assert.deepEqual(outcomes.map((item) => item.state).sort(), ["created", "revised"]);
  assert.ok(outcomes.every((item) => item.resultRefs.length === 0 && /completion cannot be assessed/.test(item.limitations)));
});

test("Git commit outcomes remain distinct from direct, inferred, and unlinked session relationships", () => {
  const commitA = h("a"), commitB = h("b"), commitC = h("c");
  const sessionEvent = ev({ id: "a", type: "tool_call", sequence: 1 });
  const linked = base([sessionEvent], [commitA, commitB, commitC]);
  linked.agents.sessions[0].relatedCommitReferences = [commitA];
  linked.episodes = [
    { gitCommitRefs: [commitA], sessionRefs: [{ sessionKey: h("s") }], groupingBasis: ["explicit_commit_reference"] },
    { gitCommitRefs: [commitB], sessionRefs: [{ sessionKey: h("s") }], groupingBasis: ["multiple_shared_file_references"] },
  ];
  const results = analyzeEngineeringOutcomes(linked).filter((item) => item.category === "git_commit");
  assert.equal(results.find((item) => item.resultRefs[0] === commitA).relationshipType, "direct_reference");
  assert.equal(results.find((item) => item.resultRefs[0] === commitB).relationshipType, "inferred_association");
  const unlinked = results.find((item) => item.resultRefs[0] === commitC);
  assert.equal(unlinked.relationshipType, "unlinked");
  assert.equal(unlinked.activityRefs.length, 0);
  assert.match(unlinked.limitations, /without a supported session relationship/);
});

test("duplicate events deduplicate; unsupported review, CI, and product decisions are not invented", () => {
  const call = ev({ id: "d", type: "tool_call", sequence: 1 });
  const result = ev({ id: "e", type: "tool_result", sequence: 2, parentEventId: call.eventId, outcome: "success" });
  const outcomes = analyzeEngineeringOutcomes(base([call, result, result]));
  assert.equal(outcomes.filter((item) => item.category === "tool_execution").length, 1);
  assert.equal(outcomes.some((item) => ["review", "ci", "product_decision", "test_result", "build_result"].includes(item.category)), false);
});
