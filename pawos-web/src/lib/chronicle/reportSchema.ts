import { createHash } from "node:crypto";

const ROOT_KEYS = ["schemaVersion", "reportId", "createdAt", "sourceAvailability", "project", "git", "developmentStory", "contribution", "dimensions", "agents", "privacy"];
const GIT_KEYS = ["evidenceClass", "authorship", "commitCount", "fileChanges", "insertions", "deletions", "currentBranchCount", "mergeCommitCount", "activityByDay", "fileCategories", "commitIds", "historyTruncated"];
const SESSION_KEYS = ["sessionKey", "source", "association", "evidence", "startedAt", "endedAt", "durationSeconds", "userTurns", "assistantTurns", "promptWordCount", "planningSignals", "correctionSignals", "toolCallCount", "toolKinds", "models", "failureSignals", "recoverySignals"];
const COVERAGE_KEYS = ["sourceId", "adapterId", "adapterVersion", "format", "estimatedFiles", "filesRead", "matchedSessions", "skippedFiles"];
const METRIC_KEYS = ["sessionCount", "sourceCounts", "modelCounts", "averagePromptWords", "planningSignals", "correctionSignals", "toolCalls", "toolCounts", "longestSessionSeconds", "sessionsWithDuration", "maxConcurrentSessions", "failureSignals", "recoverySignals", "sessionDays", "gitCommitsOnSessionDays", "overlappingGitDays", "correlationNote"];
const safeString = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const nullableCount = (value: unknown) => value === null || count(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const objectCounts = (value: unknown, allowed: Set<string>) => isRecord(value) && Object.keys(value).length <= 64 && Object.entries(value).every(([key, amount]) => allowed.has(key) && count(amount));
const time = (value: unknown) => value === null || (typeof value === "string" && safeString(value, 40) && !Number.isNaN(Date.parse(value)));
const agentSources = new Set(["claude-code", "codex", "gemini-cli"]);
const sourceIds = new Set(["claude-code", "codex", "codex-archived", "gemini-cli"]);
const adapterFormats: Record<string, string> = {
  "claude-code": "Claude Code JSONL transcript (observed record schema)",
  codex: "Codex rollout JSONL (session_meta / response_item / event_msg)",
  "gemini-cli": "Gemini CLI conversation JSONL (ConversationRecord / message records)",
};
const toolKinds = new Set(["shell", "file_edit", "file_read", "search", "verification", "other", "tool"]);
const validModel = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(value) && !/(?:sk-|ghp_|github_pat_|xox[baprs]-|AKIA|AIza)/i.test(value);
const agentClaims = new Set([
  "Confirmed local agent-session records were analyzed after approval. Transcript text was used only in memory for derived counts and is not retained in this report.",
  "Supported source locations were found but not approved for transcript reading. No external session contents were read.",
  "No supported, repository-associated session records were included. An installed agent is not evidence of use.",
]);
const correlationNote = "Date overlap is temporal context only. It does not attribute commits or changes to a person or agent.";

export type ChronicleSession = {
  sessionKey: string; source: "claude-code" | "codex" | "gemini-cli"; association: "exact_root";
  evidence: "confirmed"; startedAt: string | null; endedAt: string | null; durationSeconds: number | null;
  userTurns: number; assistantTurns: number; promptWordCount: number; planningSignals: number; correctionSignals: number;
  toolCallCount: number; toolKinds: string[]; models: string[]; failureSignals: number; recoverySignals: number;
};
export type ChronicleReport = {
  schemaVersion: 2; reportId: string; createdAt: string; sourceAvailability: Record<string, string>;
  project: { localProjectId: string; displayName: string; association: "exact_root" };
  git: { evidenceClass: "git_activity"; authorship: "unknown"; commitCount: number; fileChanges: number; insertions: number; deletions: number; currentBranchCount: number; mergeCommitCount: number; activityByDay: Array<{day:string;commits:number}>; fileCategories:Array<{category:string;changes:number}>;commitIds:string[];historyTruncated:boolean };
  developmentStory: string;
  contribution: { manual: "unknown"; aiAssisted: "unknown"; collaborative: "unknown"; unclassified: "git_activity_only" };
  dimensions: Array<{ key: string; score: null; status: "insufficient_evidence"; evidence: [] }>;
  agents: { sessions: ChronicleSession[]; sourceCoverage: Array<Record<string, unknown>>; metrics: Record<string, unknown>; claim: string };
  privacy: { rawSourceCodeIncluded: false; rawDiffsIncluded: false; commitMessagesIncluded: false; authorIdentitiesIncluded: false; absoluteProjectPathIncluded: false; rawAgentTranscriptsIncluded: false; rawPromptTextIncluded: false; rawToolOutputIncluded: false };
};

export function validateChronicleReport(input: unknown): { ok: true; report: ChronicleReport } | { ok: false; message: string } {
  if (!isRecord(input)) return { ok: false, message: "Choose a valid Chronicle report JSON file." };
  const value = input;
  if (!exactKeys(value, ROOT_KEYS) || value.schemaVersion !== 2) return { ok: false, message: "This report version is not supported or contains fields Chronicle won't upload." };
  if (typeof value.reportId !== "string" || !safeString(value.reportId, 40) || !/^[0-9a-f-]{36}$/i.test(value.reportId) || typeof value.createdAt !== "string" || !safeString(value.createdAt, 40) || Number.isNaN(Date.parse(value.createdAt))) return { ok: false, message: "Report identity or date is invalid." };
  const project = value.project;
  if (!isRecord(project) || !exactKeys(project, ["localProjectId", "displayName", "association"]) || typeof project.localProjectId !== "string" || !/^[a-f0-9]{64}$/.test(project.localProjectId) || typeof project.displayName !== "string" || !safeString(project.displayName, 120) || /[\\/:]/.test(project.displayName) || project.displayName === "." || project.displayName === ".." || project.association !== "exact_root") return { ok: false, message: "Project metadata does not match the supported privacy-safe format." };
  const availabilityKeys = ["git", "agentSessions", "ide", "testRuns", "buildRuns", "ciRuns"];
  const allowedAvailability = new Set(["implemented", "not_implemented", "unavailable", "partial"]);
  const availability = value.sourceAvailability;
  if (!isRecord(availability) || !exactKeys(availability, availabilityKeys) || availabilityKeys.some((key) => typeof availability[key] !== "string" || !allowedAvailability.has(availability[key] as string))) return { ok: false, message: "Source coverage is invalid." };
  const git = value.git;
  if (!isRecord(git) || !exactKeys(git, GIT_KEYS) || git.evidenceClass !== "git_activity" || git.authorship !== "unknown" || !["commitCount", "fileChanges", "insertions", "deletions", "currentBranchCount", "mergeCommitCount"].every((key) => count(git[key])) || typeof git.historyTruncated !== "boolean") return { ok: false, message: "Git activity is missing or invalid." };
  if (!Array.isArray(git.commitIds) || git.commitIds.length > 2000 || git.commitIds.some((id: unknown) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) || new Set(git.commitIds).size !== git.commitIds.length || git.commitCount !== git.commitIds.length) return { ok: false, message: "Commit references are invalid." };
  if (!Array.isArray(git.activityByDay) || git.activityByDay.length > 2000 || git.activityByDay.some((row: unknown) => !isRecord(row) || !exactKeys(row, ["day", "commits"]) || typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || Number.isNaN(Date.parse(String(row.day) + "T00:00:00Z")) || !count(row.commits))) return { ok: false, message: "Git activity timeline is invalid." };
  const categories = new Set(["test", "ci", "implementation", "documentation", "configuration", "other"]);
  if (!Array.isArray(git.fileCategories) || git.fileCategories.length > 10 || git.fileCategories.some((row: unknown) => !isRecord(row) || !exactKeys(row, ["category", "changes"]) || typeof row.category !== "string" || !categories.has(row.category) || !count(row.changes))) return { ok: false, message: "Git file categories are invalid." };
  const dimensions = ["planning", "technical_understanding", "verification", "steering", "coordination"];
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== dimensions.length || value.dimensions.some((row: unknown, index: number) => !isRecord(row) || !exactKeys(row, ["key", "score", "status", "evidence"]) || row.key !== dimensions[index] || row.score !== null || row.status !== "insufficient_evidence" || !Array.isArray(row.evidence) || row.evidence.length !== 0)) return { ok: false, message: "Scoring fields must remain unassigned unless evidence supports them." };
  const contribution = value.contribution;
  if (!isRecord(contribution) || !exactKeys(contribution, ["manual", "aiAssisted", "collaborative", "unclassified"]) || contribution.manual !== "unknown" || contribution.aiAssisted !== "unknown" || contribution.collaborative !== "unknown" || contribution.unclassified !== "git_activity_only") return { ok: false, message: "Contribution classifications are invalid." };
  const agents = value.agents;
  if (!isRecord(agents) || !exactKeys(agents, ["sessions", "sourceCoverage", "metrics", "claim"]) || !Array.isArray(agents.sessions) || agents.sessions.length > 1000 || !Array.isArray(agents.sourceCoverage) || agents.sourceCoverage.length > 8 || typeof agents.claim !== "string" || !agentClaims.has(agents.claim)) return { ok: false, message: "Agent evidence is invalid." };
  if (agents.sessions.length > 0 && !["implemented", "partial"].includes(String(availability.agentSessions))) return { ok: false, message: "Session summaries require implemented session-source coverage." };
  const sessionKeys = new Set<string>();
  for (const row of agents.sessions) {
    if (!isRecord(row) || !exactKeys(row, SESSION_KEYS) || typeof row.sessionKey !== "string" || !/^[a-f0-9]{64}$/.test(row.sessionKey) || sessionKeys.has(row.sessionKey) || typeof row.source !== "string" || !agentSources.has(row.source) || row.association !== "exact_root" || row.evidence !== "confirmed" || !time(row.startedAt) || !time(row.endedAt) || !nullableCount(row.durationSeconds) || !["userTurns", "assistantTurns", "promptWordCount", "planningSignals", "correctionSignals", "toolCallCount", "failureSignals", "recoverySignals"].every((key) => count(row[key])) || !Array.isArray(row.toolKinds) || row.toolKinds.length > 20 || row.toolKinds.some((item) => typeof item !== "string" || !toolKinds.has(item)) || !Array.isArray(row.models) || row.models.length > 8 || row.models.some((item) => !validModel(item))) return { ok: false, message: "Agent session summary is invalid or contains unsupported data." };
    sessionKeys.add(row.sessionKey);
  }
  for (const row of agents.sourceCoverage) if (!isRecord(row) || !exactKeys(row, COVERAGE_KEYS) || typeof row.sourceId !== "string" || !sourceIds.has(row.sourceId) || typeof row.adapterId !== "string" || !agentSources.has(row.adapterId) || (row.sourceId !== "codex-archived" && row.sourceId !== row.adapterId) || !safeString(row.adapterVersion, 20) || row.format !== adapterFormats[row.adapterId] || !["estimatedFiles", "filesRead", "matchedSessions", "skippedFiles"].every((key) => count(row[key]))) return { ok: false, message: "Agent source coverage is invalid." };
  const metricSets = { sourceCounts: new Set(["claude-code", "codex", "gemini-cli"]), modelCounts: new Set((agents.sessions as Array<{models:string[]}>).flatMap((row) => row.models)), toolCounts: toolKinds };
  const metrics = agents.metrics;
  if (!isRecord(metrics) || !exactKeys(metrics, METRIC_KEYS) || metrics.sessionCount !== agents.sessions.length || !objectCounts(metrics.sourceCounts, metricSets.sourceCounts) || !objectCounts(metrics.modelCounts, metricSets.modelCounts) || !objectCounts(metrics.toolCounts, metricSets.toolCounts) || !["planningSignals", "correctionSignals", "toolCalls", "sessionsWithDuration", "maxConcurrentSessions", "failureSignals", "recoverySignals", "sessionDays", "gitCommitsOnSessionDays", "overlappingGitDays"].every((key) => count(metrics[key])) || !nullableCount(metrics.averagePromptWords) || !nullableCount(metrics.longestSessionSeconds) || metrics.correlationNote !== correlationNote) return { ok: false, message: "Agent analysis metrics are invalid." };
  const privacy = value.privacy;
  if (!isRecord(privacy) || !exactKeys(privacy, ["rawSourceCodeIncluded", "rawDiffsIncluded", "commitMessagesIncluded", "authorIdentitiesIncluded", "absoluteProjectPathIncluded", "rawAgentTranscriptsIncluded", "rawPromptTextIncluded", "rawToolOutputIncluded"]) || Object.values(privacy).some((flag) => flag !== false)) return { ok: false, message: "This file is not marked as a privacy-safe Chronicle report." };
  if (!safeString(value.developmentStory, 800)) return { ok: false, message: "Report narrative is invalid." };
  return { ok: true, report: value as unknown as ChronicleReport };
}

export function chronicleSnapshotHash(report: ChronicleReport): string {
  const stable = JSON.stringify({ projectId: report.project.localProjectId, commits: [...report.git.commitIds].sort(), sessions: report.agents.sessions.map((session) => session.sessionKey).sort(), sourceAvailability: report.sourceAvailability });
  return createHash("sha256").update(stable).digest("hex");
}
