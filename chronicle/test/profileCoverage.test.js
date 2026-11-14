import test from "node:test";
import assert from "node:assert/strict";
import { buildDeveloperProfile } from "../src/analysis/developerProfile.js";
import { buildSourceCoverage } from "../src/analysis/sourceCoverage.js";
import { outsideProjectSourceOptions } from "../src/discovery/externalSources.js";

const refA = "a".repeat(64), refB = "b".repeat(64);
const observation = (overrides = {}) => ({
  observationId: "obs-correction", category: "ai_steering", signal: "correction_followups",
  description: "A recorded correction was followed by an agent action.", evidenceRefs: [refA, refB],
  confidence: "medium", evidenceClassification: "confirmed",
  evidenceCoverage: { totalAvailable: 2, referencesIncluded: 2, omitted: 0, truncated: false, coveragePercent: 100 },
  limitations: "The later action may not have addressed the correction.", ...overrides,
});

test("default source coverage distinguishes markers, project activity and external sources without inspecting paths", () => {
  const projectDiscovery = { detectedAgents: [{ adapterId: "aider", configurationDetected: false, configurationMarkers: [], activityFiles: [{ path: ".aider.chat.history.md", parserStatus: "project_local_supported" }], activitySourceDetected: true, behavioralAnalysis: "project_local_chat_history_supported" }], unidentifiedActivitySources: [] };
  const report = { git: { commitCount: 0 } };
  const coverage = buildSourceCoverage({
    report, projectDiscovery,
    externalOptions: outsideProjectSourceOptions([{ adapterId: "codex", sourceId: "codex", path: "C:/private/session-store", location: "external" }]),
    localApproval: {},
  });
  assert.equal(coverage.detectedAgents[0].activityEvidenceObserved, false);
  assert.equal(coverage.detectedAgents[0].usageEstablished, false);
  assert.equal(coverage.projectLocalSources.find((item) => item.sourceType === "agent_activity").inspectionStatus, "not_approved");
  assert.equal(coverage.externalSources[0].status, "not_inspected");
  assert.equal(coverage.externalSources[0].discoveredFiles, null);
  assert.doesNotMatch(JSON.stringify(coverage), /C:\/private/);
});

test("approved project-local parsing and approved external parsing remain source-specific", () => {
  const discovery = { detectedAgents: [{ adapterId: "aider", configurationDetected: false, configurationMarkers: [], activityFiles: [{ path: ".aider.chat.history.md", parserStatus: "project_local_supported" }], activitySourceDetected: true, behavioralAnalysis: "project_local_chat_history_supported" }], unidentifiedActivitySources: [] };
  const result = { adapterId: "aider", sourceId: "aider", matched: 2, filesRead: 1 };
  const coverage = buildSourceCoverage({
    report: { git: { commitCount: 5 } }, projectDiscovery: discovery,
    localApproval: { ".aider.chat.history.md": true },
    externalOptIn: true, externalInventory: [{ sourceId: "codex", adapterId: "codex", available: true, sessionFiles: 3, skippedOversize: 0 }],
    externalApproval: { codex: true },
    sourceResults: [result, { sourceId: "codex", adapterId: "codex", matched: 4, filesRead: 3 }],
  });
  assert.equal(coverage.projectLocalSources.find((item) => item.sourceType === "agent_activity").inspectionStatus, "parsed");
  assert.equal(coverage.externalSources[0].status, "parsed");
  assert.equal(coverage.externalSources[0].sessionsMatched, 4);
});

test("developer profile cites only supported observations and refuses unsupported coaching", () => {
  const report = {
    behavioralAnalysis: { observations: [observation(), observation({ observationId: "obs-lexical", signal: "correction_language", evidenceClassification: "heuristic", confidence: "low", evidenceRefs: ["c".repeat(64)], evidenceCoverage: { totalAvailable: 1, referencesIncluded: 1, omitted: 0, truncated: false, coveragePercent: 100 } })] },
    agents: { sessions: [
      { sessionKey: "session-1", sequenceSummary: { evidenceRefs: [refA] } },
      { sessionKey: "session-2", sequenceSummary: { evidenceRefs: [refB] } },
    ] },
  };
  const profile = buildDeveloperProfile(report);
  const steering = profile.areas.find((item) => item.key === "ai_steering");
  assert.equal(steering.status, "observed");
  assert.deepEqual(steering.observationIds, ["obs-correction", "obs-lexical"]);
  assert.equal(steering.evidenceCoverage.coveragePercent, 100);
  assert.equal(profile.recurringPatterns.length, 1);
  assert.equal(profile.recurringPatterns[0].distinctSessions, 2);
  assert.equal(profile.strengths.length, 0, "observed event presence is not itself evidence of effectiveness");
  assert.match(steering.summary, /\[CONFIRMED · MEDIUM\]/);
  assert.match(steering.summary, /\[HEURISTIC · LOW\]/);
  assert.deepEqual(profile.improvementOpportunities, []);
  assert.equal(profile.areas.find((item) => item.key === "product_thinking").status, "not_assessed");
});

test("agent tool lifecycle is not presented as developer-directed orchestration", () => {
  const profile = buildDeveloperProfile({
    behavioralAnalysis: { observations: [observation({ category:"agent_orchestration", signal:"explicit_background_lifecycle", description:"20 tool background lifecycle events were recorded." })] },
    agents: { sessions: [] },
  });
  const area = profile.areas.find((item) => item.key === "agent_orchestration");
  assert.equal(area.status, "not_assessed");
  assert.equal(area.confidence, "insufficient");
  assert.match(area.summary, /Developer-directed delegation cannot be established/);
  assert.equal(profile.strengths.length, 0);
});
