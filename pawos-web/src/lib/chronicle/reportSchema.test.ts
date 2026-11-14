import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildChronicleDevelopmentStory, chronicleSnapshotHash, validateChronicleReport } from "./reportSchema";
import { buildDeveloperProfile } from "../../../../chronicle/src/analysis/developerProfile.js";

function fixture() {
  return {
    schemaVersion: 2, reportId: "bbf69c4c-3bc8-4c2b-bc04-3b314cbf1992", createdAt: "2026-11-09T10:00:00.000Z",
    sourceAvailability: { git: "implemented", agentSessions: "unavailable", ide: "not_implemented", testRuns: "not_implemented", buildRuns: "not_implemented", ciRuns: "not_implemented" },
    project: { localProjectId: "a".repeat(64), displayName: "sample-project", association: "exact_root" },
    git: { evidenceClass: "git_activity", authorship: "unknown", commitCount: 1, fileChanges: 2, insertions: 3, deletions: 1, currentBranchCount: 1, mergeCommitCount: 0, activityByDay: [{ day: "2026-11-08", commits: 1 }], fileCategories: [{ category: "implementation", changes: 2 }], commitIds: ["b".repeat(64)], historyTruncated: false },
    developmentStory: "One Git commit was observed. Authorship is unknown.",
    contribution: { manual: "unknown", aiAssisted: "unknown", collaborative: "unknown", unclassified: "git_activity_only" },
    dimensions: ["planning", "technical_understanding", "verification", "steering", "coordination"].map((key) => ({ key, score: null, status: "insufficient_evidence", evidence: [] })),
    agents: { sessions: [], sourceCoverage: [], metrics: { sessionCount: 0, sourceCounts: {}, modelCounts: {}, averagePromptWords: null, planningSignals: 0, correctionSignals: 0, toolCalls: 0, toolCounts: {}, longestSessionSeconds: null, sessionsWithDuration: 0, maxConcurrentSessions: 0, failureSignals: 0, recoverySignals: 0, sessionDays: 0, gitCommitsOnSessionDays: 0, overlappingGitDays: 0, correlationNote: "Date overlap is temporal context only. It does not attribute commits or changes to a person or agent." }, claim: "No supported, repository-associated session records were included. An installed agent is not evidence of use." },
    privacy: { rawSourceCodeIncluded: false, rawDiffsIncluded: false, commitMessagesIncluded: false, authorIdentitiesIncluded: false, absoluteProjectPathIncluded: false, rawAgentTranscriptsIncluded: false, rawPromptTextIncluded: false, rawToolOutputIncluded: false },
  };
}

describe("Chronicle cloud report validation", () => {
  it("accepts the local Git report shape", () => expect(validateChronicleReport(fixture()).ok).toBe(true));
  it("accepts the generated local v4 demonstration report", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const validation = validateChronicleReport(report);
    if (!validation.ok) throw new Error(validation.message + " expected=" + buildChronicleDevelopmentStory(report) + " actual=" + report.developmentStory);
    expect(validation.ok).toBe(true);
    expect(report.schemaVersion).toBe(6);
    expect(report.episodes.length).toBeGreaterThan(0);
    expect(report.behavioralAnalysis.observations.length).toBeGreaterThan(0);
    expect(report.episodes[0].completionStatus).toBe("unknown");
    expect(report.unassignedActivity.gitCommitRefs.length).toBeGreaterThan(0);
  });
  it("validates v7 source coverage and recomputes the evidence-linked profile", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const current = { ...report, schemaVersion: 7 };
    current.sourceInventory = {
      schemaVersion: 1,
      detectedAgents: [],
      projectLocalSources: [{ sourceId: "git", sourceType: "repository_history", detectionStatus: "available", parserStatus: "supported", consentStatus: "not_required", inspectionStatus: "parsed", filesDiscovered: current.git.commitCount, filesRead: 0, sessionsMatched: 0, limitation: "Git commits and file-change metadata are activity evidence; they do not establish authorship." }],
      externalSources: [],
    };
    current.developerProfile = buildDeveloperProfile(current);
    expect(validateChronicleReport(current).ok).toBe(true);
    const forged = structuredClone(current);
    forged.developerProfile.areas[0].summary = "The developer is an expert planner.";
    expect(validateChronicleReport(forged).ok).toBe(false);
  });
  it("accepts bounded v8 outcomes and rejects unknown, private, or foreign evidence references", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const v7 = { ...report, schemaVersion: 7 };
    v7.sourceInventory = { schemaVersion: 1, detectedAgents: [], projectLocalSources: [{ sourceId: "git", sourceType: "repository_history", detectionStatus: "available", parserStatus: "supported", consentStatus: "not_required", inspectionStatus: "parsed", filesDiscovered: v7.git.commitCount, filesRead: 0, sessionsMatched: 0, limitation: "Git activity is not author attribution." }], externalSources: [] };
    v7.developerProfile = buildDeveloperProfile(v7);
    const commitRef = v7.unassignedActivity.gitCommitRefs[0];
    for (const episode of v7.episodes) episode.outcomeRefs = [];
    const activityRefs: string[] = [], resultRefs = [commitRef], category = "git_commit", state = "committed", relationshipType = "unlinked";
    const stable = [v7.project.localProjectId, category, state, ...activityRefs, "->", ...resultRefs, relationshipType].join("\0");
    const outcome = { outcomeId: createHash("sha256").update(`chronicle-engineering-outcome-v1\0${stable}`).digest("hex"), category, state, activityRefs, resultRefs,
      provenance: [{ sourceAdapter: "git", recordType: "git_commit_metadata" }], confidence: "high", evidenceClassification: "confirmed", relationshipType,
      limitations: "A Git commit is observed without a supported session relationship. No authorship, review, merge, or acceptance is established." };
    const current = { ...v7, schemaVersion: 8, engineeringOutcomes: [outcome], engineeringOutcomeCoverage: { totalAvailable:1, referencesIncluded:1, omitted:0, truncated:false, coveragePercent:100 } };
    expect(validateChronicleReport(current).ok).toBe(true);
    const foreign = structuredClone(current); foreign.engineeringOutcomes[0].resultRefs = ["f".repeat(64)];
    expect(validateChronicleReport(foreign).ok).toBe(false);
    const privateField = structuredClone(current); privateField.engineeringOutcomes[0].rawPrompt = "private";
    expect(validateChronicleReport(privateField).ok).toBe(false);
    const badProvenance = structuredClone(current); badProvenance.engineeringOutcomes[0].provenance[0].sourceAdapter = "claude-code";
    expect(validateChronicleReport(badProvenance).ok).toBe(false);
    const badCoverage = structuredClone(current); badCoverage.engineeringOutcomeCoverage.coveragePercent = 99;
    expect(validateChronicleReport(badCoverage).ok).toBe(false);
    const duplicateId = structuredClone(current); duplicateId.engineeringOutcomes.push(structuredClone(duplicateId.engineeringOutcomes[0])); duplicateId.engineeringOutcomeCoverage = { totalAvailable:2, referencesIncluded:2, omitted:0, truncated:false, coveragePercent:100 };
    expect(validateChronicleReport(duplicateId).ok).toBe(false);
    const forgedVerification = structuredClone(current); forgedVerification.engineeringOutcomes[0].verificationStatus = "server_verified";
    expect(validateChronicleReport(forgedVerification).ok).toBe(false);
    expect(validateChronicleReport({ ...current, schemaVersion:9 }).ok).toBe(false);
  });
  it("accepts v3 Chronicle-native dimensions while retaining v2 report compatibility", () => {
    const legacy = fixture();
    const current = { ...legacy, schemaVersion: 3, dimensions: ["planning", "ai_steering", "execution_leverage", "engineering_quality", "product_thinking"].map((key) => ({ key, score: null, status: "insufficient_evidence", evidenceCount: 0, confidence: "insufficient", explanation: "No score is assigned without sufficient evidence.", positiveSignals: [], improvementOpportunities: [], evidenceRefs: [] })) };
    current.developmentStory = buildChronicleDevelopmentStory(current as never);
    expect(validateChronicleReport(current).ok).toBe(true);
    expect(validateChronicleReport({ ...current, dimensions: legacy.dimensions }).ok).toBe(false);
    expect(validateChronicleReport({ ...current, developmentStory: "secret prompt text" }).ok).toBe(false);
  });
  it("rejects unsupported episode completion claims and narrative edits", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const falselyComplete = structuredClone(report);
    falselyComplete.episodes[0].completionStatus = "complete";
    expect(validateChronicleReport(falselyComplete).ok).toBe(false);
    const alteredNarrative = structuredClone(report);
    alteredNarrative.episodes[0].narrative = "The engineering task was definitely finished.";
    expect(validateChronicleReport(alteredNarrative).ok).toBe(false);
  });
  it("rejects altered behavioral claims, invalid provenance and unsupported authorship", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const alteredDescription = structuredClone(report);
    alteredDescription.behavioralAnalysis.observations[0].description = "The developer independently resolved every issue.";
    expect(validateChronicleReport(alteredDescription).ok).toBe(false);
    const alteredReference = structuredClone(report);
    alteredReference.behavioralAnalysis.observations[0].evidenceRefs = ["f".repeat(64)];
    expect(validateChronicleReport(alteredReference).ok).toBe(false);
    const alteredClassification = structuredClone(report);
    const unavailable = alteredClassification.behavioralAnalysis.observations.find((item: { evidenceClassification: string }) => item.evidenceClassification === "unavailable");
    unavailable.evidenceClassification = "confirmed";
    expect(validateChronicleReport(alteredClassification).ok).toBe(false);
  });
  it("rejects inconsistent v6 evidence coverage and client-asserted verification", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const wrongCount = structuredClone(report);
    wrongCount.behavioralAnalysis.observations[0].evidenceCoverage.omitted += 1;
    expect(validateChronicleReport(wrongCount).ok).toBe(false);
    const alteredGitCount = structuredClone(report);
    const gitObservation = alteredGitCount.behavioralAnalysis.observations.find((item: { signal: string }) => item.signal === "git_activity_only");
    gitObservation.evidenceCount += 1;
    gitObservation.description = `${gitObservation.evidenceCount} Git commit record(s) were observed independently of author attribution.`;
    expect(validateChronicleReport(alteredGitCount).ok).toBe(false);
    const wrongSource = structuredClone(report);
    wrongSource.behavioralAnalysis.observations[0].evidenceCoverage.source = "git";
    expect(validateChronicleReport(wrongSource).ok).toBe(false);
    const forgedStatus = structuredClone(report);
    forgedStatus.behavioralAnalysis.observations[0].verificationStatus = "server_verified";
    expect(validateChronicleReport(forgedStatus).ok).toBe(false);
    const forgedConfidence = structuredClone(report);
    forgedConfidence.behavioralAnalysis.observations[0].confidence = "high";
    expect(validateChronicleReport(forgedConfidence).ok).toBe(false);
  });
  it("rejects a zero-evidence observation with references and preserves legacy v5 compatibility", async () => {
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const zeroEvidence = structuredClone(report);
    const unavailable = zeroEvidence.behavioralAnalysis.observations.find((item: { evidenceClassification: string }) => item.evidenceClassification === "unavailable");
    unavailable.evidenceCoverage.totalAvailable = 0;
    unavailable.evidenceCoverage.referencesIncluded = 1;
    unavailable.evidenceCoverage.omitted = 0;
    unavailable.evidenceCoverage.coveragePercent = 0;
    unavailable.evidenceRefs = ["a".repeat(64)];
    expect(validateChronicleReport(zeroEvidence).ok).toBe(false);
    const legacyV5 = structuredClone(report);
    legacyV5.schemaVersion = 5;
    legacyV5.behavioralAnalysis.schemaVersion = 1;
    delete legacyV5.behavioralAnalysis.evidenceCoverage;
    for (const item of legacyV5.behavioralAnalysis.observations) { delete item.evidenceCoverage; delete item.verificationStatus; }
    expect(validateChronicleReport(legacyV5).ok).toBe(true);
  });
  it("upgrades only Git counts independently verifiable from sanitized evidence", async () => {
    const { applyChronicleServerVerification } = await import("./reportSchema");
    const report = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const verified = applyChronicleServerVerification(report);
    const git = verified.behavioralAnalysis.observations.find((item: { signal: string }) => item.signal === "git_activity_only");
    const session = verified.behavioralAnalysis.observations.find((item: { signal: string }) => item.signal === "correction_language");
    expect(git.verificationStatus).toBe("server_verified");
    expect(session.verificationStatus).toBe("locally_generated");
  });
  it("retains v4 episode-report compatibility after adding v5 behavior data", async () => {
    const current = JSON.parse(await readFile(new URL("../../../../chronicle/examples/demo-report.json", import.meta.url), "utf8"));
    const legacyV4 = structuredClone(current);
    legacyV4.schemaVersion = 4;
    delete legacyV4.behavioralAnalysis;
    expect(validateChronicleReport(legacyV4).ok).toBe(true);
  });
  it("rejects filesystem paths, raw content, and unimplemented agent claims", () => {
    for (const mutate of [
      (value: ReturnType<typeof fixture>) => ({ ...value, projectRoot: "C:/private/project" }),
      (value: ReturnType<typeof fixture>) => ({ ...value, git: { ...value.git, rawDiff: "secret" } }),
      (value: ReturnType<typeof fixture>) => ({ ...value, agents: { ...value.agents, sessions: [{ prompt: "private" }] } }),
      (value: ReturnType<typeof fixture>) => ({ ...value, dimensions: value.dimensions.map((row, index) => index === 0 ? { ...row, score: 98 } : row) }),
    ]) {
      const value = mutate(fixture()); expect(validateChronicleReport(value).ok).toBe(false);
    }
  });
  it("accepts derived session summaries and rejects raw prompt text", () => {
    const value = fixture();
    const agents = value.agents as unknown as { sessions: unknown[]; sourceCoverage: unknown[]; metrics: Record<string, unknown>; claim: string };
    const session = { sessionKey: "d".repeat(64), source: "claude-code", association: "exact_root", evidence: "confirmed", startedAt: "2026-11-08T10:00:00.000Z", endedAt: "2026-11-08T10:05:00.000Z", durationSeconds: 300, userTurns: 2, assistantTurns: 2, promptWordCount: 80, planningSignals: 1, correctionSignals: 0, toolCallCount: 3, toolKinds: ["shell", "file_edit"], models: ["claude-sonnet-4-5"], failureSignals: 0, recoverySignals: 0 };
    agents.sessions = [session];
    agents.sourceCoverage = [{ sourceId: "claude-code", adapterId: "claude-code", adapterVersion: "1", format: "Claude Code JSONL transcript (observed record schema)", estimatedFiles: 3, filesRead: 3, matchedSessions: 1, skippedFiles: 0 }];
    agents.metrics = { ...agents.metrics, sessionCount: 1, sourceCounts: { "claude-code": 1 }, modelCounts: { "claude-sonnet-4-5": 1 }, averagePromptWords: 40, toolCounts: { shell: 1, file_edit: 1 }, longestSessionSeconds: 300, sessionsWithDuration: 1, maxConcurrentSessions: 1 };
    value.sourceAvailability.agentSessions = "implemented";
    expect(validateChronicleReport(value).ok).toBe(true);
    expect(validateChronicleReport({ ...value, agents: { ...value.agents, sessions: [{ ...session, prompt: "private prompt" }] } }).ok).toBe(false);
  });
  it("hashes equivalent commit snapshots identically and changes when commit evidence changes", () => {
    const first = validateChronicleReport(fixture());
    if (!first.ok) throw new Error(first.message);
    const same = { ...first.report, reportId: "ccf69c4c-3bc8-4c2b-bc04-3b314cbf1992", createdAt: "2026-11-09T11:00:00.000Z" };
    expect(chronicleSnapshotHash(same)).toBe(chronicleSnapshotHash(first.report));
    const changed = { ...same, git: { ...same.git, commitIds: ["c".repeat(64)] } };
    expect(chronicleSnapshotHash(changed)).not.toBe(chronicleSnapshotHash(first.report));
    const changedObservation = { ...same, behavioralAnalysis: { schemaVersion: 1 as const, observations: [{ observationId:"e".repeat(64), category:"ai_steering", signal:"correction_followups", evidenceCount:1, description:"A correction preceded a later agent action.", evidenceRefs:["f".repeat(64)], sourceAdapter:"claude-code", provenance:[{sourceAdapter:"claude-code",recordTypes:["developer_correction"]}], confidence:"medium" as const, evidenceClassification:"confirmed" as const, limitations:"The later action may be unrelated." }] } };
    expect(chronicleSnapshotHash(changedObservation)).not.toBe(chronicleSnapshotHash(same));
  });
});

