import { describe, expect, it } from "vitest";
import { chronicleSnapshotHash, validateChronicleReport } from "./reportSchema";

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
  });
});

