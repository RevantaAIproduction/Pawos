import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: true, inserted: null as Record<string, unknown> | null }));
vi.mock("../../../../lib/account/api", () => ({
  rejectCrossOrigin: () => null,
  requireAccount: async () => state.authenticated
    ? { ok: true, account: { user: { id: "pawos-user-1" }, supabase: { from: (table: string) => ({ insert: (row: Record<string, unknown>) => { state.inserted = { table, ...row }; return { select: () => ({ single: async () => ({ data: { id: "cloud-report-1", project_name: row.project_name, created_at: "2026-11-09T00:00:00.000Z" }, error: null }) }) }; } }) } } }
    : { ok: false, response: Response.json({ ok: false }, { status: 401 }) },
}));

import { POST } from "./route";

function validReport() {
  return {
    schemaVersion: 2, reportId: "bbf69c4c-3bc8-4c2b-bc04-3b314cbf1992", createdAt: "2026-11-09T10:00:00.000Z",
    sourceAvailability: { git: "implemented", agentSessions: "unavailable", ide: "not_implemented", testRuns: "not_implemented", buildRuns: "not_implemented", ciRuns: "not_implemented" },
    project: { localProjectId: "a".repeat(64), displayName: "sample-project", association: "exact_root" },
    git: { evidenceClass: "git_activity", authorship: "unknown", commitCount: 1, fileChanges: 1, insertions: 3, deletions: 0, currentBranchCount: 1, mergeCommitCount: 0, activityByDay: [{ day: "2026-11-08", commits: 1 }], fileCategories: [{ category: "implementation", changes: 1 }], commitIds: ["b".repeat(64)], historyTruncated: false },
    developmentStory: "Client supplied narrative that the server must replace.",
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
    expect(result.report.id).toBe("cloud-report-1");
  });
});
