import test from "node:test";
import assert from "node:assert/strict";
import { simulateScoring } from "../src/analysis/scoringSimulator.js";

const h = (char) => char.repeat(64);
let reportNo = 0;
function report({ category = "planning", signal = "explicit_plan_events", classification = "confirmed", total = 3, included = 3, outcomes = [] } = {}) {
  const id = `00000000-0000-4000-8000-${String(++reportNo).padStart(12, "0")}`;
  const obs = { observationId: `obs-${id}`, category, signal, evidenceClassification: classification, confidence: "high", sourceAdapter: "codex", evidenceRefs: Array.from({ length: included }, (_, i) => h(String(i % 9 + 1))), evidenceCoverage: { totalAvailable: total, referencesIncluded: included, omitted: Math.max(0, total - included), truncated: included < total, coveragePercent: total ? included / total * 100 : 0 } };
  if (outcomes.length) obs.calibrationOutcomes = outcomes;
  return { schemaVersion: 7, reportId: id, project: { localProjectId: h("a") }, agents: { sessions: outcomes.map((item) => ({ sessionKey: item.sessionRef, sequenceSummary: { evidenceRefs: [item.sessionRef] } })) }, behavioralAnalysis: { observations: [obs] } };
}
function outcomes(count = 5) { return Array.from({ length: count }, (_, i) => ({ outcome: i < 3 ? "positive" : "adverse", evidenceClassification: "confirmed", confidence: "high", evidenceRef: h(String(i + 1)), sessionRef: h(String(i + 2)), episodeRef: h(String(i % 3 + 3)) })); }

test("ordinary activity, lexical hints and absent outcomes never become a score", () => {
  const r = report({ signal: "planning_language", classification: "heuristic" });
  const result = simulateScoring([r]);
  const plan = result.dimensions.find((item) => item.dimension === "planning");
  assert.equal(plan.simulationOnlyScore, null);
  assert.ok(plan.exclusions.some((item) => item.reason === "heuristic_or_unavailable_classification"));
  const explicitButOutcomeFree = simulateScoring([report()]).dimensions[0];
  assert.ok(explicitButOutcomeFree.exclusions.some((item) => item.reason === "activity_observation_is_not_a_measured_outcome"));
});

test("labeled synthetic evidence can exercise the candidate formula and compare thresholds", () => {
  const r = report({ total: 6, included: 6, outcomes: outcomes(6) });
  const strict = simulateScoring([r], { preset: "conservative" }).dimensions[0];
  const exploratory = simulateScoring([r], { preset: "exploratory" }).dimensions[0];
  assert.equal(strict.status, "simulation_candidate");
  assert.equal(strict.simulationOnlyScore, 50);
  assert.equal(exploratory.simulationOnlyScore, 50);
  assert.equal(simulateScoring([r]).productionUse, false);
});

test("duplicate reports and repeated evidence do not inflate counts or change results", () => {
  const r = report({ total: 6, included: 6, outcomes: outcomes(6) });
  const baseline = simulateScoring([r]);
  const repeated = simulateScoring([r, r]);
  assert.equal(repeated.duplicateReportsIgnored, 1);
  assert.deepEqual(repeated.dimensions, baseline.dimensions);
  const anotherSnapshot = { ...r, reportId: "00000000-0000-4000-8000-999999999999" };
  const twoSnapshots = simulateScoring([r, anotherSnapshot]);
  assert.equal(twoSnapshots.dimensions[0].evidence.eligibleOutcomes, 6);
});

test("contradictory evidence is excluded and missing evidence is not adverse", () => {
  const first = report({ total: 6, included: 6, outcomes: outcomes(6) });
  const changed = JSON.parse(JSON.stringify(first));
  changed.reportId = "00000000-0000-4000-8000-999999999998";
  changed.behavioralAnalysis.observations[0].calibrationOutcomes[0].outcome = "adverse";
  const result = simulateScoring([first, changed]).dimensions[0];
  assert.equal(result.evidence.excludedConflicts, 1);
  assert.ok(result.reasons.includes("contradictory_evidence_excluded"));
  assert.equal(result.evidence.adverseOutcomes, 3);
});

test("truncated, zero-coverage, unavailable, unsupported and low-confidence evidence abstain", () => {
  for (const r of [
    report({ total: 20, included: 6, outcomes: outcomes() }),
    report({ total: 0, included: 0 }),
    report({ classification: "unavailable", total: 0, included: 0 }),
    report({ signal: "future_unsupported_signal", total: 6, included: 6, outcomes: outcomes() }),
    report({ total: 6, included: 6, outcomes: outcomes().map((item) => ({ ...item, confidence: "low" })) }),
  ]) {
    const result = simulateScoring([r]).dimensions[0];
    assert.equal(result.simulationOnlyScore, null);
  }
});

test("manual, AI-assisted and hybrid labels are not used as authorship or productivity evidence", () => {
  for (const approach of ["manual_first", "ai_assisted", "hybrid"]) {
    const r = report({ category: "execution_approach", signal: "ai_session_activity", outcomes: [] });
    r.contribution = { classification: approach };
    const result = simulateScoring([r]).dimensions.find((item) => item.dimension === "execution_leverage");
    assert.equal(result.simulationOnlyScore, null);
    assert.ok(result.exclusions.some((item) => item.reason === "activity_observation_is_not_a_measured_outcome"));
  }
});

test("simulator output is deterministic for the same saved reports", () => {
  const r = report({ total: 6, included: 6, outcomes: outcomes() });
  assert.deepEqual(simulateScoring([r]), simulateScoring([r]));
});

test("calibration displays observed Chronicle lifecycle outcomes without treating them as scoring labels", () => {
  const r = report({ total:6, included:6, outcomes:outcomes() });
  r.schemaVersion = 8;
  r.engineeringOutcomes = [{ outcomeId:h("f"), category:"tool_execution", state:"passed", activityRefs:[h("1")], resultRefs:[h("2")], provenance:[{sourceAdapter:"codex",recordType:"response_item.function_call_output"}], confidence:"high", evidenceClassification:"confirmed", relationshipType:"direct_reference", limitations:"A tool operation succeeded; test semantics are unknown." }];
  const result = simulateScoring([r]).dimensions.find((item) => item.dimension === "engineering_quality");
  assert.deepEqual(result.observedOutcomeRecords, { "tool_execution:passed":1 });
  assert.equal(result.simulationOnlyScore, null);
  assert.match(result.outcomeEvidenceLimit, /not adjudicated/);
});

test("simulator deduplicates an evolving outcome identity and keeps contradictory variants visible", () => {
  const first = report({ total:6, included:6, outcomes:outcomes() });
  first.schemaVersion = 8;
  first.reportId = "11111111-1111-4111-8111-111111111111";
  first.createdAt = "2026-01-01T00:00:00Z";
  first.engineeringOutcomes = [{ outcomeId:h("a"), category:"tool_execution", state:"passed", activityRefs:[h("1")], resultRefs:[h("2")], provenance:[], confidence:"high", evidenceClassification:"confirmed", relationshipType:"direct_reference", limitations:"Operation record." }];
  const second = structuredClone(first);
  second.reportId = "22222222-2222-4222-8222-222222222222";
  second.createdAt = "2026-02-01T00:00:00Z";
  second.engineeringOutcomes[0] = { ...second.engineeringOutcomes[0], outcomeId:h("b"), state:"failed", evidenceClassification:"probable" };
  const result = simulateScoring([first,second]).dimensions.find((item) => item.dimension === "engineering_quality");
  assert.deepEqual(result.observedOutcomeRecords, { "tool_execution:failed":1 });
  assert.equal(result.observedOutcomeConflicts, 1);
  assert.equal(result.simulationOnlyScore, null);
});
