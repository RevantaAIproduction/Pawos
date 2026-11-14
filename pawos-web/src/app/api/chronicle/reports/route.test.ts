import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const state = vi.hoisted(() => ({ authenticated: true, inserted: null as Record<string, unknown> | null }));
vi.mock("../../../../lib/account/api", () => ({
  rejectCrossOrigin: () => null,
  requireAccount: async () => state.authenticated
    ? { ok: true, account: { user: { id: "pawos-user-1" }, supabase: { from: (table: string) => ({ insert: (row: Record<string, unknown>) => { state.inserted = { table, ...row }; return { select: () => ({ single: async () => ({ data: { id: "cloud-report-1", project_name: row.project_name, created_at: "2026-11-09T00:00:00.000Z" }, error: null }) }) }; } }) } } }
    : { ok: false, response: Response.json({ ok: false }, { status: 401 }) },
}));

import { POST } from "./route";
import { buildChronicleDevelopmentStory } from "../../../../lib/chronicle/reportSchema";
import { buildDeveloperProfile } from "../../../../../../chronicle/src/analysis/developerProfile.js";

function validReport() {
  return {
    schemaVersion: 2, reportId: "bbf69c4c-3bc8-4c2b-bc04-3b314cbf1992", createdAt: "2026-11-09T10:00:00.000Z",
    sourceAvailability: { git: "implemented", agentSessions: "unavailable", ide: "not_implemented", testRuns: "not_implemented", buildRuns: "not_implemented", ciRuns: "not_implemented" },
    project: { localProjectId: "a".repeat(64), displayName: "sample-project", association: "exact_root" },
    git: { evidenceClass: "git_activity", authorship: "unknown", commitCount: 1, fileChanges: 1, insertions: 3, deletions: 0, currentBranchCount: 1, mergeCommitCount: 0, activityByDay: [{ day: "2026-11-08", commits: 1 }], fileCategories: [{ category: "implementation", changes: 1 }], commitIds: ["b".repeat(64)], historyTruncated: false },
    developmentStory: "Git records one commit. Git metadata does not establish authorship.",
    contribution: { manual: "unknown", aiAssisted: "unknown", collaborative: "unknown", unclassified: "git_activity_only" },
    dimensions: ["planning", "technical_understanding", "verification", "steering", "coordination"].map((key) => ({ key, score: null, status: "insufficient_evidence", evidence: [] })),
    agents: { sessions: [], sourceCoverage: [], metrics: { sessionCount: 0, sourceCounts: {}, modelCounts: {}, averagePromptWords: null, planningSignals: 0, correctionSignals: 0, toolCalls: 0, toolCounts: {}, longestSessionSeconds: null, sessionsWithDuration: 0, maxConcurrentSessions: 0, failureSignals: 0, recoverySignals: 0, sessionDays: 0, gitCommitsOnSessionDays: 0, overlappingGitDays: 0, correlationNote: "Date overlap is temporal context only. It does not attribute commits or changes to a person or agent." }, claim: "No supported, repository-associated session records were included. An installed agent is not evidence of use." },
    privacy: { rawSourceCodeIncluded: false, rawDiffsIncluded: false, commitMessagesIncluded: false, authorIdentitiesIncluded: false, absoluteProjectPathIncluded: false, rawAgentTranscriptsIncluded: false, rawPromptTextIncluded: false, rawToolOutputIncluded: false },
  };
}

describe("POST /api/chronicle/reports", () => {
  beforeEach(() => { state.authenticated = true; state.inserted = null; });
  it("refuses uploads without the existing PawOS account", async () => {
    state.authenticated = false;
    const response = await POST(new Request("https://pawos.test/api/chronicle/reports", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(state.inserted).toBeNull();
  });
  it("rejects unapproved raw fields before storage", async () => {
    const report = { ...validReport(), projectRoot: "C:/private/project" };
    const response = await POST(new Request("https://pawos.test/api/chronicle/reports", { method: "POST", body: JSON.stringify(report) }));
    expect(response.status).toBe(400);
    expect(state.inserted).toBeNull();
  });
  it("stores only the authenticated owner and normalized evidence report", async () => {
    const response = await POST(new Request("https://pawos.test/api/chronicle/reports", { method: "POST", body: JSON.stringify(validReport()) }));
    const result = await response.json();
    expect(response.status).toBe(201);
    expect(state.inserted).toMatchObject({ table: "chronicle_reports", user_id: "pawos-user-1", project_name: "sample-project" });
    expect(state.inserted?.report_data).toMatchObject({ contribution: { manual: "unknown", aiAssisted: "unknown" }, git: { authorship: "unknown" } });
    expect((state.inserted?.report_data as {developmentStory:string}).developmentStory).not.toContain("Client supplied");
    expect((state.inserted?.report_data as {developmentStory:string}).developmentStory).toBe(buildChronicleDevelopmentStory(validReport() as never));
    expect(result.report.id).toBe("cloud-report-1");
  });
  it("marks only deterministically recomputable v6 evidence as server verified", async () => {
    const file = new URL("../../../../../../chronicle/examples/demo-report.json", import.meta.url);
    const report = JSON.parse(await readFile(file, "utf8"));
    const response = await POST(new Request("https://pawos.test/api/chronicle/reports", { method: "POST", body: JSON.stringify(report) }));
    expect(response.status).toBe(201);
    const stored = state.inserted?.report_data as { behavioralAnalysis: { observations: Array<{ signal: string; verificationStatus: string }> } };
    expect(stored.behavioralAnalysis.observations.find((item) => item.signal === "git_activity_only")?.verificationStatus).toBe("server_verified");
    expect(stored.behavioralAnalysis.observations.find((item) => item.signal === "correction_language")?.verificationStatus).toBe("locally_generated");
  });
  it("stores sanitized v8 outcome evidence without claiming server verification of session semantics", async () => {
    const file = new URL("../../../../../../chronicle/examples/demo-report.json", import.meta.url);
    const v6 = JSON.parse(await readFile(file, "utf8"));
    const report = { ...v6, schemaVersion: 7 };
    report.sourceInventory = { schemaVersion: 1, detectedAgents: [], projectLocalSources: [{ sourceId:"git", sourceType:"repository_history", detectionStatus:"available", parserStatus:"supported", consentStatus:"not_required", inspectionStatus:"parsed", filesDiscovered:report.git.commitCount, filesRead:0, sessionsMatched:0, limitation:"Git activity is not author attribution." }], externalSources:[] };
    report.developerProfile = buildDeveloperProfile(report);
    const commitRef = report.unassignedActivity.gitCommitRefs[0];
    for (const episode of report.episodes) episode.outcomeRefs = [];
    const category = "git_commit", stateName = "committed", relationshipType = "unlinked", activityRefs: string[] = [], resultRefs = [commitRef];
    const stable = [report.project.localProjectId, category, stateName, ...activityRefs, "->", ...resultRefs, relationshipType].join("\0");
    report.schemaVersion = 8;
    report.engineeringOutcomes = [{ outcomeId:createHash("sha256").update(`chronicle-engineering-outcome-v1\0${stable}`).digest("hex"), category, state:stateName, activityRefs, resultRefs, provenance:[{sourceAdapter:"git",recordType:"git_commit_metadata"}], confidence:"high", evidenceClassification:"confirmed", relationshipType, limitations:"Observed Git metadata does not establish authorship, review, merge, or acceptance." }];
    report.engineeringOutcomeCoverage = { totalAvailable:1, referencesIncluded:1, omitted:0, truncated:false, coveragePercent:100 };
    const { validateChronicleReport } = await import("../../../../lib/chronicle/reportSchema");
    const validation = validateChronicleReport(report);
    if (!validation.ok) throw new Error(validation.message);
    const response = await POST(new Request("https://pawos.test/api/chronicle/reports", { method:"POST", body:JSON.stringify(report) }));
    expect(response.status).toBe(201);
    const stored = state.inserted?.report_data as { engineeringOutcomes: Array<Record<string, unknown>>; agents: { sessions: Array<Record<string, unknown>> } };
    expect(stored.engineeringOutcomes[0]).toMatchObject({ outcomeId:report.engineeringOutcomes[0].outcomeId, evidenceClassification:"confirmed", relationshipType:"unlinked" });
    expect(stored.engineeringOutcomes[0].verificationStatus).toBeUndefined();
    const serialized = JSON.stringify(stored);
    for (const privateValue of ["DO_NOT_UPLOAD_SOURCE", "DO_NOT_UPLOAD_MESSAGE", "C:\\private\\project", "Implement the report."]) expect(serialized).not.toContain(privateValue);
    expect(stored.agents.sessions.every((session:Record<string, unknown>)=>!Object.hasOwn(session,"events"))).toBe(true);
  });
  it("rebuilds v7 profiles on the server and does not accept event occurrence as a strength", async () => {
    const file = new URL("../../../../../../chronicle/examples/demo-report.json", import.meta.url);
    const report = JSON.parse(await readFile(file, "utf8"));
    report.schemaVersion = 7;
    report.sourceInventory = { schemaVersion: 1, detectedAgents: [], projectLocalSources: [{ sourceId:"git", sourceType:"repository_history", detectionStatus:"available", parserStatus:"supported", consentStatus:"not_required", inspectionStatus:"parsed", filesDiscovered:report.git.commitCount, filesRead:0, sessionsMatched:0, limitation:"Git commits and file-change metadata are activity evidence; they do not establish authorship." }], externalSources:[] };
    report.developerProfile = buildDeveloperProfile(report);
    report.developerProfile.strengths = [{ statement:"Client fabricated strength", category:"planning", confidence:"high", observationIds:[], evidenceRefs:[] }];
    const response = await POST(new Request("https://pawos.test/api/chronicle/reports", { method: "POST", body: JSON.stringify(report) }));
    expect(response.status).toBe(400);
    expect(state.inserted).toBeNull();
    report.developerProfile = buildDeveloperProfile(report);
    const accepted = await POST(new Request("https://pawos.test/api/chronicle/reports", { method: "POST", body: JSON.stringify(report) }));
    expect(accepted.status).toBe(201);
    expect((state.inserted?.report_data as {developerProfile:{strengths:unknown[]}}).developerProfile.strengths).toEqual([]);
  });
});
