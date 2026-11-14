import { createHash } from "node:crypto";

const ROOT_KEYS = ["schemaVersion", "reportId", "createdAt", "sourceAvailability", "project", "git", "developmentStory", "contribution", "dimensions", "agents", "privacy"];
const ROOT_KEYS_V4 = [...ROOT_KEYS, "episodes", "unassignedActivity"];
const ROOT_KEYS_V5 = [...ROOT_KEYS_V4, "behavioralAnalysis"];
const ROOT_KEYS_V6 = ROOT_KEYS_V5;
const ROOT_KEYS_V7 = [...ROOT_KEYS_V6, "sourceInventory", "developerProfile"];
const ROOT_KEYS_V8 = [...ROOT_KEYS_V7, "engineeringOutcomes", "engineeringOutcomeCoverage"];
const GIT_KEYS = ["evidenceClass", "authorship", "commitCount", "fileChanges", "insertions", "deletions", "currentBranchCount", "mergeCommitCount", "activityByDay", "fileCategories", "commitIds", "historyTruncated"];
const SESSION_KEYS_V2 = ["sessionKey", "source", "association", "evidence", "startedAt", "endedAt", "durationSeconds", "userTurns", "assistantTurns", "promptWordCount", "planningSignals", "correctionSignals", "toolCallCount", "toolKinds", "models", "failureSignals", "recoverySignals"];
const SESSION_KEYS_V3 = [...SESSION_KEYS_V2, "sequenceSummary"];
const COVERAGE_KEYS = ["sourceId", "adapterId", "adapterVersion", "format", "estimatedFiles", "filesRead", "matchedSessions", "skippedFiles"];
const METRIC_KEYS = ["sessionCount", "sourceCounts", "modelCounts", "averagePromptWords", "planningSignals", "correctionSignals", "toolCalls", "toolCounts", "longestSessionSeconds", "sessionsWithDuration", "maxConcurrentSessions", "failureSignals", "recoverySignals", "sessionDays", "gitCommitsOnSessionDays", "overlappingGitDays", "correlationNote"];
const safeString = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const nullableCount = (value: unknown) => value === null || count(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const objectCounts = (value: unknown, allowed: Set<string>) => isRecord(value) && Object.keys(value).length <= 64 && Object.entries(value).every(([key, amount]) => allowed.has(key) && count(amount));
const time = (value: unknown) => value === null || (typeof value === "string" && safeString(value, 40) && !Number.isNaN(Date.parse(value)));
const agentSources = new Set(["claude-code", "codex", "gemini-cli", "aider"]);
const sourceIds = new Set(["claude-code", "codex", "codex-archived", "gemini-cli", "aider"]);
const adapterFormats: Record<string, string> = {
  "claude-code": "Claude Code JSONL transcript (observed record schema)",
  codex: "Codex rollout JSONL (session_meta / response_item / event_msg)",
  "gemini-cli": "Gemini CLI conversation JSONL (ConversationRecord / message records)",
  aider: "Aider project-local Markdown chat history (# aider chat started / #### user input)",
};
const toolKinds = new Set(["shell", "file_edit", "file_read", "search", "verification", "other", "tool"]);
const validModel = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(value) && !/(?:sk-|ghp_|github_pat_|xox[baprs]-|AKIA|AIza)/i.test(value);
const agentClaims = new Set([
  "Confirmed local agent-session records were analyzed after approval. Transcript text was used only in memory for derived counts and is not retained in this report.",
  "Approved local agent-session records were analyzed, and one or more approved sources could not be fully read. Transcript text was used only in memory for derived counts and is not retained in this report.",
  "Supported session sources were found but not approved. No unapproved session contents were read.",
  "One or more approved session sources could not be analyzed. No session data from those sources is included in this report.",
  "No supported, repository-associated session records were included. An installed agent is not evidence of use.",
]);
const correlationNote = "Date overlap is temporal context only. It does not attribute commits or changes to a person or agent.";
const formatCount = (value: unknown) => Number(value || 0).toLocaleString("en-US");
const eventRef = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const behavioralSources = new Set(["claude-code", "codex", "gemini-cli", "aider", "git", "chronicle", "multiple"]);
const adapterRecordType = (source: string, type: string) => source === "git" ? type === "git_commit_metadata"
  : source === "claude-code" ? new Set(["session_boundary", "session_meta", "user", "assistant", "tool_use", "tool_result"]).has(type)
  : source === "codex" ? new Set(["session_boundary", "session_meta"]).has(type) || /^(event_msg|response_item)\.[a-z0-9_.:-]{1,56}$/.test(type)
      : source === "gemini-cli" ? new Set(["conversation_metadata", "message.error", "message.gemini", "message.user", "tool_call_record", "tool_call_record.result"]).has(type)
        : source === "aider" ? new Set(["aider.session_start_marker", "aider.markdown_user_heading", "aider.markdown_turn_output", "session_boundary"]).has(type)
        : source === "chronicle" && type === "";
const behavioralDefinitions: Record<string, { category: string; classification: string; confidence: string; describe: (count: number) => string; limitations: string }> = {
  explicit_plan_events: { category: "planning", classification: "confirmed", confidence: "high", describe: (n) => `Codex records contain ${n} explicit plan creation or update event(s). Plan text is not retained.`, limitations: "The plan content, task breakdown and whether the plan was followed are unavailable." },
  plan_tool_indicators: { category: "planning", classification: "heuristic", confidence: "low", describe: (n) => `${n} tool event(s) were classified as planning-related from a plan or todo tool name.`, limitations: "Tool naming is a heuristic; it does not establish a plan's content, sequence or execution." },
  planning_language: { category: "planning", classification: "heuristic", confidence: "low", describe: (n) => `${n} prompt(s) contained planning-related language indicators.`, limitations: "Lexical indicators do not establish a complete plan, its sequence or execution." },
  task_decomposition_unavailable: { category: "planning", classification: "unavailable", confidence: "low", describe: () => "Task decomposition cannot be assessed from the retained evidence.", limitations: "Plan content and individual task steps are not retained." },
  plan_revisions: { category: "technical_decision", classification: "confirmed", confidence: "high", describe: (n) => `Codex records contain ${n} explicit plan update event(s).`, limitations: "The before-and-after plan content, alternatives and decision rationale are unavailable." },
  plan_tool_revisions: { category: "technical_decision", classification: "heuristic", confidence: "low", describe: (n) => `${n} tool event(s) were classified as plan updates from a plan or todo tool name.`, limitations: "Tool naming does not reveal whether a technical decision changed or why." },
  alternatives_unavailable: { category: "technical_decision", classification: "unavailable", confidence: "low", describe: () => "Technical alternatives and unresolved decisions cannot be assessed.", limitations: "Raw conversation and source contents are not retained, and tool activity alone does not establish a decision." },
  correction_events: { category: "ai_steering", classification: "confirmed", confidence: "high", describe: (n) => `Adapters recorded ${n} developer correction event(s).`, limitations: "Correction events do not establish why a correction was needed or whether the underlying issue was resolved." },
  correction_language: { category: "ai_steering", classification: "heuristic", confidence: "low", describe: (n) => `${n} prompt(s) contained correction-language indicators.`, limitations: "Lexical matching can misclassify ordinary instructions; the prompt text is not retained." },
  correction_followups: { category: "ai_steering", classification: "confirmed", confidence: "medium", describe: (n) => `${n} correction event(s) were followed by a later recorded agent action in source order.`, limitations: "Sequence does not prove the later action addressed the correction or improved the result." },
  ai_session_activity: { category: "execution_approach", classification: "confirmed", confidence: "high", describe: (n) => `${n} approved AI-agent session(s) contain recorded event activity.`, limitations: "Session activity does not attribute code authorship or prove that an agent-produced change entered Git." },
  git_activity_only: { category: "execution_approach", classification: "confirmed", confidence: "high", describe: (n) => `${n} Git commit record(s) were observed independently of author attribution.`, limitations: "Git metadata does not establish whether work was manual, AI-assisted or collaborative." },
  authorship_unavailable: { category: "execution_approach", classification: "unavailable", confidence: "low", describe: () => "Manual, AI-assisted and hybrid code authorship cannot be distinguished from the available evidence.", limitations: "Commits are not attributed to nearby sessions; direct human or agent authorship records are unavailable." },
  manual_authorship_unavailable: { category: "execution_approach", classification: "unavailable", confidence: "low", describe: () => "Confirmed manual code contribution is unavailable in the collected evidence.", limitations: "Git author metadata and session absence or presence do not prove who wrote a change." },
  ai_authorship_unavailable: { category: "execution_approach", classification: "unavailable", confidence: "low", describe: () => "Confirmed AI-authored code contribution is unavailable in the collected evidence.", limitations: "An AI session or tool call does not prove its output entered the repository." },
  hybrid_authorship_unavailable: { category: "execution_approach", classification: "unavailable", confidence: "low", describe: () => "Confirmed human-and-agent contribution to the same changes is unavailable.", limitations: "Session and Git proximity or episode linkage does not establish collaborative authorship." },
  explicit_orchestration: { category: "agent_orchestration", classification: "confirmed", confidence: "high", describe: (n) => `${n} explicit subagent or agent-to-agent relationship event(s) were recorded.`, limitations: "Only adapter-recorded relationships are included; a complete handoff or concurrent-work picture is not available." },
  explicit_background_lifecycle: { category: "agent_orchestration", classification: "confirmed", confidence: "high", describe: (n) => `${n} explicit background-execution lifecycle event(s) were recorded.`, limitations: "The events do not establish whether background work completed successfully unless a linked result says so." },
  orchestration_unavailable: { category: "agent_orchestration", classification: "unavailable", confidence: "low", describe: () => "No explicit orchestration relationship was available in the retained session events.", limitations: "Concurrency, delegation and handoffs are not inferred from timestamp overlap." },
  verification_attempt: { category: "verification", classification: "heuristic", confidence: "low", describe: (n) => `${n} tool event(s) were classified as verification-related from the adapter's tool identity.`, limitations: "The tool name does not prove a test, build or review ran; no pass/fail conclusion is inferred." },
  verification_result: { category: "verification", classification: "heuristic", confidence: "medium", describe: (n) => `${n} tool result(s) with explicit outcomes followed a tool name classified as verification-related.`, limitations: "Tool-name classification is heuristic; an explicit successful result is not independently validated as a passing test suite or release check." },
  verification_unavailable: { category: "verification", classification: "unavailable", confidence: "low", describe: () => "Test, build, type-check and review outcomes are unavailable.", limitations: "Git test-file changes and CI configuration do not establish that checks were run." },
  failure_events: { category: "failure_recovery", classification: "confirmed", confidence: "high", describe: (n) => `${n} explicit error or failed-result event(s) were recorded.`, limitations: "Error events may be partial; they do not establish user impact or task failure." },
  later_success_signals: { category: "failure_recovery", classification: "probable", confidence: "medium", describe: (n) => `${n} later-success signal(s) followed a recorded failure.`, limitations: "A later successful tool result may be unrelated; this does not establish recovery of the original issue or task completion." },
  product_language: { category: "product_thinking", classification: "heuristic", confidence: "low", describe: (n) => `${n} prompt(s) contained product, user-impact or trade-off language indicators.`, limitations: "Lexical indicators do not establish a product requirement, decision, user research or rationale." },
  product_decisions_unavailable: { category: "product_thinking", classification: "unavailable", confidence: "low", describe: () => "Product requirements, user-impact decisions and scope trade-offs cannot be confirmed.", limitations: "The retained event model does not preserve decision content or product context." },
};
const episodeBases = new Set(["explicit_session_parent_link", "explicit_inter_agent_relationship", "shared_explicit_task_reference", "same_explicit_branch_and_multiple_file_references", "explicit_commit_reference", "multiple_shared_file_references", "single_session_observed_sequence"]);
const episodeTitles = new Set(["Testing and implementation activity", "Implementation activity", "Documentation activity", "Investigation activity", "Linked development activity", "Development activity"]);
const episodeStepTypes = new Set(["planning", "agent_execution", "agent_delegation", "background_execution", "developer_correction", "failure", "later_success_signal", "verification_tool", "git_activity"]);

function validSequenceSummary(value: unknown): boolean {
  const keys = ["schemaVersion", "initialIntent", "planningBeforeFirstTool", "planningEvidenceRefs", "firstToolCallEventId", "toolCallCount", "toolResultCount", "correctionCount", "correctionFollowUpCount", "failureCount", "recoveryCount", "completionStatus", "modelChangeCount", "modelSequence", "subagentDispatchCount", "subagentReturnCount", "backgroundEventCount", "missingTimestampCount", "eventCount", "truncated", "evidenceRefs"];
  if (!isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1 || !(value.initialIntent === null || ["change", "debug", "explain", "plan", "unclassified"].includes(String(value.initialIntent))) || !(value.planningBeforeFirstTool === null || typeof value.planningBeforeFirstTool === "boolean") || !(value.firstToolCallEventId === null || eventRef(value.firstToolCallEventId)) || !["toolCallCount", "toolResultCount", "correctionCount", "correctionFollowUpCount", "failureCount", "recoveryCount", "modelChangeCount", "subagentDispatchCount", "subagentReturnCount", "backgroundEventCount", "missingTimestampCount", "eventCount"].every((key) => count(value[key])) || Number(value.eventCount) > 3_000 || typeof value.truncated !== "boolean" || !["success", "failure", "not_observed"].includes(String(value.completionStatus))) return false;
  if (!Array.isArray(value.planningEvidenceRefs) || value.planningEvidenceRefs.length > 32 || value.planningEvidenceRefs.some((item: unknown) => !eventRef(item))) return false;
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 3_000 || value.evidenceRefs.some((item: unknown) => !eventRef(item))) return false;
  if (!Array.isArray(value.modelSequence) || value.modelSequence.length > 8 || value.modelSequence.some((item: unknown) => !isRecord(item) || !exactKeys(item, ["modelIdentifier", "eventId"]) || !validModel(item.modelIdentifier) || !eventRef(item.eventId))) return false;
  return true;
}

/** Mirrors the local deterministic narrative; v3 reports cannot smuggle arbitrary client text into storage. */
export function buildChronicleDevelopmentStory(report: ChronicleReport): string {
  const git = report.git;
  const sessions = report.agents.sessions;
  const metrics = report.agents.metrics as Record<string, unknown>;
  const parts = [git.commitCount
    ? `Git records ${formatCount(git.commitCount)} commits, ${formatCount(git.fileChanges)} file-change records, +${formatCount(git.insertions)} insertions and −${formatCount(git.deletions)} deletions for ${report.project.displayName}. Git metadata does not establish who authored this work.`
    : `No Git commits were available for ${report.project.displayName}; Chronicle cannot infer manual or AI contribution from an empty history.`];
  if (!sessions.length) {
    parts.push("No supported, approved agent sessions were matched. Chronicle therefore leaves AI use, collaboration and behavioral assessment unassigned.");
    return parts.join(" ").slice(0, 800);
  }
  const sourceCounts = metrics.sourceCounts as Record<string, number>;
  const toolCounts = metrics.toolCounts as Record<string, number>;
  parts.push(`${formatCount(sessions.length)} approved local agent sessions were observed across ${formatCount(Object.keys(sourceCounts).length)} supported tool source(s).`);
  const timelines = sessions.map((session) => session.sequenceSummary).filter((summary): summary is Record<string, unknown> => isRecord(summary));
  const plannedBeforeAction = timelines.filter((summary) => summary.planningBeforeFirstTool === true).length;
  if (plannedBeforeAction) parts.push(`${formatCount(plannedBeforeAction)} session(s) show planning evidence before the first recorded tool action, based on source order.`);
  const steered = timelines.reduce((sum, summary) => sum + Number(summary.correctionFollowUpCount || 0), 0);
  if (steered) parts.push(`${formatCount(steered)} correction(s) were followed by a later agent action in the recorded sequence.`);
  const explicitSubagents = timelines.reduce((sum, summary) => sum + Number(summary.subagentDispatchCount || 0), 0);
  if (explicitSubagents) parts.push(`${formatCount(explicitSubagents)} explicit subagent dispatch event(s) were recorded; independent child-session linkage is reported only where the source provides it.`);
  const modelChanges = timelines.reduce((sum, summary) => sum + Number(summary.modelChangeCount || 0), 0);
  if (modelChanges) parts.push(`${formatCount(modelChanges)} in-session model change(s) were observed.`);
  const failures = timelines.reduce((sum, summary) => sum + Number(summary.failureCount || 0), 0);
  const recoveries = timelines.reduce((sum, summary) => sum + Number(summary.recoveryCount || 0), 0);
  if (failures) parts.push(`${formatCount(failures)} explicit failure event(s) were observed.`);
  if (recoveries) parts.push(`${formatCount(recoveries)} failure-to-later-success sequence(s) were observed; task resolution is not established.`);
  const verification = Number(toolCounts.verification || 0);
  if (verification) parts.push(`${formatCount(verification)} verification-related tool interaction(s) were recorded, without a confirmed test/build outcome.`);
  const models = metrics.modelCounts as Record<string, number>;
  if (Object.keys(models).length) parts.push(`Recorded model identifiers include ${Object.keys(models).sort().slice(0, 3).join(", ")}.`);
  parts.push("Git/session date overlap is temporal context only and does not establish authorship, handoffs or collaborative work.");
  return parts.join(" ").slice(0, 800);
}

export function buildChronicleEpisodeNarrative(episode: ChronicleEpisode): string {
  const labels: Record<string, string> = {
    explicit_session_parent_link: "an explicit parent-child session link",
    explicit_inter_agent_relationship: "an explicit agent-to-agent session relationship",
    shared_explicit_task_reference: "a shared explicit task reference",
    same_explicit_branch_and_multiple_file_references: "an explicit branch plus multiple matching file references",
    explicit_commit_reference: "an explicit Git commit reference from the session metadata",
    multiple_shared_file_references: "multiple matching file references between a session and Git history",
    single_session_observed_sequence: "a prompt followed by an observed tool action in one session",
  };
  const linked = episode.sessionRefs.length > 1 || episode.gitCommitRefs.length > 0;
  const basis = episode.groupingBasis.map((item) => labels[item]).filter(Boolean);
  const parts = [`Chronicle groups this as ${linked ? "linked" : "single-session"} development activity using ${basis.join(" and ") || "an observed prompt-to-tool sequence"}.`];
  if (episode.intentClassification) parts.push(`The first recorded instruction was classified as ${episode.intentClassification}; this is a derived category, not a retained task description.`);
  parts.push(`${episode.participatingAgentTypes.join(", ") || "No agent source"} session evidence is included${episode.gitCommitRefs.length ? ` with ${episode.gitCommitRefs.length} directly corroborated Git commit(s)` : " without a directly linked Git commit"}.`);
  if (episode.correctionCount) parts.push(`${episode.correctionCount} correction event(s) were observed.`);
  if (episode.failureCount || episode.laterSuccessSignalCount) parts.push(`${episode.failureCount} failure event(s) and ${episode.laterSuccessSignalCount} later-success signal(s) were recorded; task resolution is unknown.`);
  if (episode.verificationEventCount) parts.push(`${episode.verificationEventCount} verification-related tool event(s) were observed; this does not establish a passing test or build.`);
  parts.push("Episode completion is unknown unless an independent task-completion record is available.");
  return parts.join(" ").slice(0, 800);
}

function validEpisode(value: unknown, projectId: string, sessionKeys: Set<string>, commitIds: Set<string>, includeOutcomeRefs = false): value is ChronicleEpisode {
  const keys = ["schemaVersion", "episodeId", "repositoryIdentity", "title", "narrative", "intentClassification", "startedAt", "endedAt", "startedAtPrecision", "endedAtPrecision", "sessionRefs", "participatingAgentTypes", "gitCommitRefs", "changedFileCategories", "sequence", "eventSequences", "eventSequenceTruncated", "correctionCount", "failureCount", "laterSuccessSignalCount", "verificationEventCount", "completionStatus", "confidence", "groupingBasis", "evidenceRefs", ...(includeOutcomeRefs ? ["outcomeRefs"] : [])];
  if (!isRecord(value) || !exactKeys(value, keys) || value.schemaVersion !== 1 || !eventRef(value.episodeId) || value.repositoryIdentity !== projectId || !episodeTitles.has(String(value.title)) || !safeString(value.narrative, 800) || !(value.intentClassification === null || ["change", "debug", "explain", "plan"].includes(String(value.intentClassification))) || !time(value.startedAt) || !time(value.endedAt) || !["millisecond", "second", "unknown"].includes(String(value.startedAtPrecision)) || !["millisecond", "second", "unknown"].includes(String(value.endedAtPrecision)) || !["unknown"].includes(String(value.completionStatus)) || !["low", "medium", "high"].includes(String(value.confidence)) || !["correctionCount", "failureCount", "laterSuccessSignalCount", "verificationEventCount"].every((key) => count(value[key]))) return false;
  if (!Array.isArray(value.sessionRefs) || value.sessionRefs.length < 1 || value.sessionRefs.length > 1_000 || value.sessionRefs.some((row: unknown) => !isRecord(row) || !exactKeys(row, ["sessionKey", "source"]) || !eventRef(row.sessionKey) || !sessionKeys.has(String(row.sessionKey)) || !agentSources.has(String(row.source)))) return false;
  if (new Set(value.sessionRefs.map((item: unknown) => isRecord(item) ? item.sessionKey : null)).size !== value.sessionRefs.length) return false;
  if (!Array.isArray(value.participatingAgentTypes) || value.participatingAgentTypes.length > 3 || value.participatingAgentTypes.some((item: unknown) => !agentSources.has(String(item))) || new Set(value.participatingAgentTypes).size !== value.participatingAgentTypes.length) return false;
  if (!Array.isArray(value.gitCommitRefs) || value.gitCommitRefs.length > 2_000 || value.gitCommitRefs.some((item: unknown) => !eventRef(item) || !commitIds.has(String(item))) || new Set(value.gitCommitRefs).size !== value.gitCommitRefs.length) return false;
  const categories = new Set(["test", "ci", "implementation", "documentation", "configuration", "other"]);
  if (!Array.isArray(value.changedFileCategories) || value.changedFileCategories.length > 6 || value.changedFileCategories.some((item: unknown) => !categories.has(String(item))) || new Set(value.changedFileCategories).size !== value.changedFileCategories.length) return false;
  if (!Array.isArray(value.sequence) || value.sequence.length > 9 || value.sequence.some((step: unknown) => !isRecord(step) || !exactKeys(step, ["type", "count", "evidenceRefs"]) || !episodeStepTypes.has(String(step.type)) || !count(step.count) || !Array.isArray(step.evidenceRefs) || step.evidenceRefs.length > 32 || step.evidenceRefs.some((item: unknown) => !eventRef(item)))) return false;
  if (typeof value.eventSequenceTruncated !== "boolean" || !Array.isArray(value.eventSequences) || value.eventSequences.length !== value.sessionRefs.length) return false;
  const eventSessionKeys = new Set<string>();
  let eventTotal = 0;
  const eventTypes = new Set(["session_start", "session_end", "user_prompt", "developer_correction", "assistant_response", "tool_call", "tool_result", "model_change", "plan_create", "plan_update", "subagent_dispatch", "subagent_return", "background_execution_start", "background_execution_end", "inter_agent_message", "error", "recovery"]);
  const actors = new Set(["user", "assistant", "tool", "subagent", "system"]);
  for (const item of value.eventSequences) {
    if (!isRecord(item) || !exactKeys(item, ["sessionKey", "source", "eventCount", "truncated", "events"]) || !eventRef(item.sessionKey) || !sessionKeys.has(String(item.sessionKey)) || !agentSources.has(String(item.source)) || !count(item.eventCount) || Number(item.eventCount) > 3_000 || typeof item.truncated !== "boolean" || !Array.isArray(item.events) || item.events.length > 100 || item.events.length > Number(item.eventCount) || eventSessionKeys.has(String(item.sessionKey)) || !value.sessionRefs.some((ref: unknown) => isRecord(ref) && ref.sessionKey === item.sessionKey && ref.source === item.source)) return false;
    eventSessionKeys.add(String(item.sessionKey));
    let lastSequence = -1;
    for (const event of item.events) {
      if (!isRecord(event) || !exactKeys(event, ["sequence", "type", "timestamp", "timestampPrecision", "actor", "outcome", "evidenceRef"]) || !count(event.sequence) || Number(event.sequence) <= lastSequence || !eventTypes.has(String(event.type)) || !time(event.timestamp) || !["millisecond", "second", "unknown"].includes(String(event.timestampPrecision)) || !actors.has(String(event.actor)) || !["none", "success", "failure", "unknown"].includes(String(event.outcome)) || !eventRef(event.evidenceRef)) return false;
      lastSequence = Number(event.sequence);
      eventTotal++;
    }
  }
  if (eventTotal > 300 || value.eventSequenceTruncated !== value.eventSequences.some((item: unknown) => isRecord(item) && item.truncated === true)) return false;
  if (!Array.isArray(value.groupingBasis) || value.groupingBasis.length < 1 || value.groupingBasis.length > 7 || value.groupingBasis.some((item: unknown) => !episodeBases.has(String(item))) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 128 || value.evidenceRefs.some((item: unknown) => !eventRef(item)) || new Set(value.evidenceRefs).size !== value.evidenceRefs.length) return false;
  if (includeOutcomeRefs && (!Array.isArray(value.outcomeRefs) || value.outcomeRefs.length > 512 || value.outcomeRefs.some((item: unknown) => !eventRef(item)) || new Set(value.outcomeRefs).size !== value.outcomeRefs.length)) return false;
  return value.narrative === buildChronicleEpisodeNarrative(value as unknown as ChronicleEpisode);
}

function validUnassignedActivity(value: unknown, sessionKeys: Set<string>, commitIds: Set<string>, groupedSessions: Set<string>, groupedCommits: Set<string>): boolean {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "sessionRefs", "gitCommitRefs", "reason"]) || value.schemaVersion !== 1 || value.reason !== "insufficient_linkage_evidence" || !Array.isArray(value.sessionRefs) || value.sessionRefs.length > 1_000 || !Array.isArray(value.gitCommitRefs) || value.gitCommitRefs.length > 2_000) return false;
  const seenSessions = new Set<string>();
  for (const row of value.sessionRefs) {
    if (!isRecord(row) || !exactKeys(row, ["sessionKey", "source"]) || !eventRef(row.sessionKey) || !sessionKeys.has(String(row.sessionKey)) || groupedSessions.has(String(row.sessionKey)) || !agentSources.has(String(row.source)) || seenSessions.has(String(row.sessionKey))) return false;
    seenSessions.add(String(row.sessionKey));
  }
  const seenCommits = new Set<string>();
  for (const id of value.gitCommitRefs) {
    if (!eventRef(id) || !commitIds.has(String(id)) || groupedCommits.has(String(id)) || seenCommits.has(String(id))) return false;
    seenCommits.add(String(id));
  }
  return true;
}

export type ChronicleSession = {
  sessionKey: string; source: "claude-code" | "codex" | "gemini-cli" | "aider"; association: "exact_root";
  evidence: "confirmed"; startedAt: string | null; endedAt: string | null; durationSeconds: number | null;
  userTurns: number; assistantTurns: number; promptWordCount: number; planningSignals: number; correctionSignals: number;
  toolCallCount: number; toolKinds: string[]; models: string[]; failureSignals: number; recoverySignals: number;
  sequenceSummary?: Record<string, unknown>;
};
export type ChronicleSourceInventory = {
  schemaVersion: 1;
  detectedAgents: Array<{agentId: string; configurationDetected: boolean; activityDetected: boolean; activityEvidenceObserved: boolean; usageEstablished: boolean; parserStatus: "project_local_supported" | "external_only" | "detection_only"}>;
  projectLocalSources: Array<{sourceId: string; sourceType: string; detectionStatus: string; parserStatus: string; consentStatus: string; inspectionStatus: string; filesDiscovered: number; filesRead: number; sessionsMatched: number; limitation: string}>;
  externalSources: Array<{sourceId: string; adapterId: string; status: string; approvalStatus: string; discoveredFiles: number | null; filesRead: number; sessionsMatched: number; limitation: string}>;
};
export type ChronicleProfileArea = { key: string; title: string; status: "observed" | "not_assessed"; summary: string; observationIds: string[]; evidenceRefs: string[]; confidence: "high" | "medium" | "low" | "insufficient"; evidenceCoverage: { evidenceAvailable: number; referencesIncluded: number; coveragePercent: number }; distinctSessions: number; limitations: string[] };
export type ChronicleDeveloperProfile = { schemaVersion: 1; status: "preliminary" | "insufficient_evidence"; areas: ChronicleProfileArea[]; strengths: Array<{statement:string;category:string;confidence:string;observationIds:string[];evidenceRefs:string[]}>; recurringPatterns: Array<{statement:string;category:string;confidence:string;distinctSessions:number;observationIds:string[];evidenceRefs:string[]}>; improvementOpportunities: Array<unknown>; evidenceCaptureRecommendations: Array<{statement:string;observationIds:string[];evidenceRefs:string[]}>; limitations:string[] };
export type ChronicleReport = {
  schemaVersion: 2 | 3 | 4 | 5 | 6 | 7 | 8; reportId: string; createdAt: string; sourceAvailability: Record<string, string>;
  project: { localProjectId: string; displayName: string; association: "exact_root" };
  git: { evidenceClass: "git_activity"; authorship: "unknown"; commitCount: number; fileChanges: number; insertions: number; deletions: number; currentBranchCount: number; mergeCommitCount: number; activityByDay: Array<{day:string;commits:number}>; fileCategories:Array<{category:string;changes:number}>;commitIds:string[];historyTruncated:boolean };
  developmentStory: string;
  contribution: { manual: "unknown"; aiAssisted: "unknown"; collaborative: "unknown"; unclassified: "git_activity_only" };
  dimensions: Array<{ key: string; score: null; status: "insufficient_evidence"; evidence?: []; evidenceCount?: number; confidence?: "insufficient"; explanation?: string; positiveSignals?: string[]; improvementOpportunities?: string[]; evidenceRefs?: string[] }>;
  agents: { sessions: ChronicleSession[]; sourceCoverage: Array<Record<string, unknown>>; metrics: Record<string, unknown>; claim: string };
  episodes?: ChronicleEpisode[];
  unassignedActivity?: { schemaVersion: 1; sessionRefs: Array<{ sessionKey: string; source: string }>; gitCommitRefs: string[]; reason: "insufficient_linkage_evidence" };
  behavioralAnalysis?: { schemaVersion: 1 | 2; observations: ChronicleBehavioralObservation[]; evidenceCoverage?: { totalObservations: number; unavailableObservations: number; truncatedObservations: number; evidenceAvailable: number; referencesIncluded: number; referencesOmitted: number; referenceCoveragePercent: number; countingBasis: string } };
  sourceInventory?: ChronicleSourceInventory;
  developerProfile?: ChronicleDeveloperProfile;
  engineeringOutcomes?: ChronicleEngineeringOutcome[];
  engineeringOutcomeCoverage?: { totalAvailable:number; referencesIncluded:number; omitted:number; truncated:boolean; coveragePercent:number };
  privacy: { rawSourceCodeIncluded: false; rawDiffsIncluded: false; commitMessagesIncluded: false; authorIdentitiesIncluded: false; absoluteProjectPathIncluded: false; rawAgentTranscriptsIncluded: false; rawPromptTextIncluded: false; rawToolOutputIncluded: false };
};

export type ChronicleEngineeringOutcome = { outcomeId:string; category:"tool_execution"|"git_commit"|"correction"|"plan_lifecycle"; state:"passed"|"failed"|"unknown"|"committed"|"response_observed"|"unresolved"|"created"|"revised"; activityRefs:string[]; resultRefs:string[]; provenance:Array<{sourceAdapter:string;recordType:string}>; confidence:"high"|"medium"|"low"; evidenceClassification:"confirmed"|"probable"|"heuristic"|"unavailable"; relationshipType:"direct_reference"|"inferred_association"|"unlinked"; limitations:string };

export type ChronicleBehavioralObservation = {
  observationId: string; category: string; signal: string; evidenceCount: number; description: string;
  evidenceRefs: string[]; sourceAdapter: string; provenance: Array<{ sourceAdapter: string; recordTypes: string[] }>;
  confidence: "high" | "medium" | "low"; evidenceClassification: "confirmed" | "probable" | "heuristic" | "unavailable"; limitations: string;
  evidenceCoverage?: { totalAvailable: number; referencesIncluded: number; omitted: number; truncated: boolean; coveragePercent: number; source: string; category: string; unavailableReason: "not_applicable" | "evidence_absent" | "not_approved" | "source_unavailable" };
  verificationStatus?: "locally_generated" | "server_verified";
};

export type ChronicleEpisode = {
  schemaVersion: 1; episodeId: string; repositoryIdentity: string; title: string; narrative: string;
  intentClassification: "change" | "debug" | "explain" | "plan" | null; startedAt: string | null; endedAt: string | null;
  startedAtPrecision: "millisecond" | "second" | "unknown"; endedAtPrecision: "millisecond" | "second" | "unknown";
  sessionRefs: Array<{ sessionKey: string; source: string }>; participatingAgentTypes: string[]; gitCommitRefs: string[];
  changedFileCategories: string[]; sequence: Array<{ type: string; count: number; evidenceRefs: string[] }>;
  eventSequences: Array<{ sessionKey: string; source: string; eventCount: number; truncated: boolean; events: Array<{ sequence: number; type: string; timestamp: string | null; timestampPrecision: string; actor: string; outcome: string; evidenceRef: string }> }>;
  eventSequenceTruncated: boolean;
  correctionCount: number; failureCount: number; laterSuccessSignalCount: number; verificationEventCount: number;
  completionStatus: "unknown"; confidence: "low" | "medium" | "high"; groupingBasis: string[]; evidenceRefs: string[]; outcomeRefs?: string[];
};

function validBehavioralAnalysis(value: unknown, projectId: string, sessionKeys: Set<string>, commitIds: Set<string>, eventIds: Set<string>, version: number, referenceSources: Map<string, string>): boolean {
  const v6 = version >= 6;
  const expectedKeys = v6 ? ["schemaVersion", "evidenceCoverage", "observations"] : ["schemaVersion", "observations"];
  if (!isRecord(value) || !exactKeys(value, expectedKeys) || value.schemaVersion !== (v6 ? 2 : 1) || !Array.isArray(value.observations) || value.observations.length > 64) return false;
  if (v6 && (!isRecord(value.evidenceCoverage) || !exactKeys(value.evidenceCoverage, ["totalObservations", "unavailableObservations", "truncatedObservations", "evidenceAvailable", "referencesIncluded", "referencesOmitted", "referenceCoveragePercent", "countingBasis"]) || value.evidenceCoverage.totalObservations !== value.observations.length || !count(value.evidenceCoverage.unavailableObservations) || !count(value.evidenceCoverage.truncatedObservations) || !count(value.evidenceCoverage.evidenceAvailable) || !count(value.evidenceCoverage.referencesIncluded) || !count(value.evidenceCoverage.referencesOmitted) || !Number.isFinite(value.evidenceCoverage.referenceCoveragePercent) || value.evidenceCoverage.countingBasis !== "per_observation; references may support multiple observations")) return false;
  const ids = new Set<string>();
  for (const raw of value.observations) {
    const keys = v6 ? ["observationId", "category", "signal", "evidenceCount", "description", "evidenceRefs", "sourceAdapter", "provenance", "confidence", "evidenceClassification", "limitations", "evidenceCoverage", "verificationStatus"] : ["observationId", "category", "signal", "evidenceCount", "description", "evidenceRefs", "sourceAdapter", "provenance", "confidence", "evidenceClassification", "limitations"];
    if (!isRecord(raw) || !exactKeys(raw, keys) || !eventRef(raw.observationId) || ids.has(String(raw.observationId))) return false;
    ids.add(String(raw.observationId));
    const definition = behavioralDefinitions[String(raw.signal)];
    if (!definition || raw.category !== definition.category || raw.evidenceClassification !== definition.classification || raw.confidence !== definition.confidence || !count(raw.evidenceCount) || Number(raw.evidenceCount) > 100_000 || raw.description !== definition.describe(Number(raw.evidenceCount)) || raw.limitations !== definition.limitations) return false;
    if (!behavioralSources.has(String(raw.sourceAdapter)) || !Array.isArray(raw.provenance) || raw.provenance.length < 1 || raw.provenance.length > 4) return false;
    const adapters = new Set<string>();
    for (const item of raw.provenance) {
      if (!isRecord(item) || !exactKeys(item, ["sourceAdapter", "recordTypes"]) || !behavioralSources.has(String(item.sourceAdapter)) || item.sourceAdapter === "multiple" || adapters.has(String(item.sourceAdapter)) || !Array.isArray(item.recordTypes) || item.recordTypes.length > 8 || item.recordTypes.some((type: unknown) => typeof type !== "string" || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(type) || (v6 && !adapterRecordType(String(item.sourceAdapter), type)))) return false;
      adapters.add(String(item.sourceAdapter));
    }
    const adapterOrder = ["claude-code", "codex", "gemini-cli", "aider", "git", "chronicle"];
    const sortedAdapters = [...adapters].sort((a, b) => (adapterOrder.indexOf(a) < 0 ? 99 : adapterOrder.indexOf(a)) - (adapterOrder.indexOf(b) < 0 ? 99 : adapterOrder.indexOf(b)) || a.localeCompare(b));
    const sourceAdapter = sortedAdapters.length > 1 ? "multiple" : sortedAdapters[0] || "chronicle";
    if (raw.sourceAdapter !== sourceAdapter || !Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length > 32 || raw.evidenceRefs.some((ref: unknown) => !eventRef(ref) || (!eventIds.has(String(ref)) && !sessionKeys.has(String(ref)) && !commitIds.has(String(ref)))) || new Set(raw.evidenceRefs).size !== raw.evidenceRefs.length) return false;
    if (v6 && raw.evidenceRefs.length) {
      const expectedSources = new Set((raw.evidenceRefs as string[]).map((ref) => referenceSources.get(ref)).filter((source): source is string => Boolean(source)));
      if (expectedSources.size !== adapters.size || [...expectedSources].some((source) => !adapters.has(source))) return false;
    }
    const classification = String(raw.evidenceClassification);
    if (classification === "unavailable" ? Number(raw.evidenceCount) !== 0 || raw.evidenceRefs.length !== 0 : Number(raw.evidenceCount) < 1 || raw.evidenceRefs.length < 1) return false;
    if (v6) {
      const coverage = raw.evidenceCoverage;
      if (!isRecord(coverage) || !exactKeys(coverage, ["totalAvailable", "referencesIncluded", "omitted", "truncated", "coveragePercent", "source", "category", "unavailableReason"]) || !count(coverage.totalAvailable) || !count(coverage.referencesIncluded) || !count(coverage.omitted) || typeof coverage.truncated !== "boolean" || !Number.isFinite(coverage.coveragePercent) || !behavioralSources.has(String(coverage.source)) || coverage.source !== raw.sourceAdapter || coverage.category !== raw.category || !["not_applicable", "evidence_absent", "not_approved", "source_unavailable"].includes(String(coverage.unavailableReason)) || coverage.referencesIncluded !== raw.evidenceRefs.length || coverage.omitted !== Math.max(0, Number(coverage.totalAvailable) - Number(coverage.referencesIncluded)) || coverage.truncated !== (Number(coverage.omitted) > 0) || coverage.coveragePercent !== (Number(coverage.totalAvailable) ? Math.round(Number(coverage.referencesIncluded) / Number(coverage.totalAvailable) * 10000) / 100 : 0) || (classification === "unavailable" ? coverage.totalAvailable !== 0 || coverage.unavailableReason === "not_applicable" : coverage.unavailableReason !== "not_applicable") || raw.verificationStatus !== "locally_generated") return false;
      if (raw.signal === "git_activity_only" && (raw.evidenceCount !== commitIds.size || coverage.totalAvailable !== commitIds.size || coverage.referencesIncluded !== Math.min(commitIds.size, 32) || coverage.source !== "git")) return false;
    }
    const stable = `${projectId}\0${raw.signal}\0${sortedAdapters.join(",")}\0${[...raw.evidenceRefs as string[]].sort().join(",")}`;
    if (raw.observationId !== createHash("sha256").update(`chronicle-behavior-v1\0${stable}`).digest("hex")) return false;
  }
  if (v6) {
    const summary = value.evidenceCoverage as Record<string, unknown>;
    const rows = value.observations as Array<Record<string, unknown>>;
    const available = rows.reduce((sum, item) => sum + Number((item.evidenceCoverage as Record<string, unknown>).totalAvailable), 0);
    const included = rows.reduce((sum, item) => sum + Number((item.evidenceCoverage as Record<string, unknown>).referencesIncluded), 0);
    const omitted = rows.reduce((sum, item) => sum + Number((item.evidenceCoverage as Record<string, unknown>).omitted), 0);
    if (summary.unavailableObservations !== rows.filter((item) => item.evidenceClassification === "unavailable").length || summary.truncatedObservations !== rows.filter((item) => (item.evidenceCoverage as Record<string, unknown>).truncated === true).length || summary.evidenceAvailable !== available || summary.referencesIncluded !== included || summary.referencesOmitted !== omitted || summary.referenceCoveragePercent !== (available ? Math.round(included / available * 10000) / 100 : 0)) return false;
  }
  return true;
}

const profileAreaDefinitions = [
  ["planning", "Planning approach"], ["technical_decision", "Technical decision-making"], ["ai_steering", "AI steering"],
  ["execution_approach", "Execution approach"], ["agent_orchestration", "Agent orchestration"], ["verification", "Verification habits"],
  ["failure_recovery", "Failure and recovery"], ["product_thinking", "Product thinking"],
];
const confidenceRanks: Record<string, number> = { high: 3, medium: 2, low: 1 };

function validSourceInventory(value: unknown, agentCoverage: Array<Record<string, unknown>>): value is ChronicleSourceInventory {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "detectedAgents", "projectLocalSources", "externalSources"]) || value.schemaVersion !== 1 || !Array.isArray(value.detectedAgents) || value.detectedAgents.length > 14 || !Array.isArray(value.projectLocalSources) || value.projectLocalSources.length > 128 || !Array.isArray(value.externalSources) || value.externalSources.length > 8) return false;
  const agentIds = new Set(["claude-code", "codex", "gemini-cli", "cursor", "github-copilot", "windsurf", "cline", "roo-code", "aider", "continue", "openhands", "amazon-q", "kiro", "opencode"]);
  const seenAgents = new Set<string>();
  for (const item of value.detectedAgents) {
    if (!isRecord(item) || !exactKeys(item, ["agentId", "configurationDetected", "activityDetected", "activityEvidenceObserved", "usageEstablished", "parserStatus"]) || typeof item.agentId !== "string" || !agentIds.has(item.agentId) || seenAgents.has(item.agentId) || typeof item.configurationDetected !== "boolean" || typeof item.activityDetected !== "boolean" || typeof item.activityEvidenceObserved !== "boolean" || item.usageEstablished !== item.activityEvidenceObserved || (item.activityEvidenceObserved && (!item.activityDetected || item.parserStatus !== "project_local_supported" && item.parserStatus !== "external_only")) || !["project_local_supported", "external_only", "detection_only"].includes(String(item.parserStatus))) return false;
    seenAgents.add(item.agentId);
  }
  const localIds = new Set(["git", "unidentified", ...agentIds]);
  for (const item of value.projectLocalSources) {
    if (!isRecord(item) || !exactKeys(item, ["sourceId", "sourceType", "detectionStatus", "parserStatus", "consentStatus", "inspectionStatus", "filesDiscovered", "filesRead", "sessionsMatched", "limitation"]) || typeof item.sourceId !== "string" || !localIds.has(item.sourceId) || !["repository_history", "configuration", "agent_activity", "unidentified_activity"].includes(String(item.sourceType)) || !["available", "detected"].includes(String(item.detectionStatus)) || !["supported", "project_local_supported", "external_only", "detection_only", "unsupported"].includes(String(item.parserStatus)) || !["not_required", "approved", "not_approved", "not_applicable"].includes(String(item.consentStatus)) || !["parsed", "configuration_only", "not_approved", "not_inspected", "unsupported", "failed"].includes(String(item.inspectionStatus)) || !["filesDiscovered", "filesRead", "sessionsMatched"].every((key) => count(item[key])) || typeof item.limitation !== "string" || !safeString(item.limitation, 400) || /[A-Za-z]:\\|\/(?:Users|home)\//i.test(item.limitation)) return false;
    if (item.inspectionStatus === "parsed" && item.parserStatus !== "supported" && item.parserStatus !== "project_local_supported") return false;
    if (item.inspectionStatus === "parsed" && item.sourceType === "agent_activity" && item.consentStatus !== "approved") return false;
    if (item.inspectionStatus === "not_approved" && item.consentStatus !== "not_approved") return false;
    if (item.sourceType === "repository_history" && (item.sourceId !== "git" || item.consentStatus !== "not_required")) return false;
  }
  const externalIds = new Set(["claude-code", "codex", "codex-archived", "gemini-cli"]);
  const seenExternal = new Set<string>();
  for (const item of value.externalSources) {
    if (!isRecord(item) || !exactKeys(item, ["sourceId", "adapterId", "status", "approvalStatus", "discoveredFiles", "filesRead", "sessionsMatched", "limitation"]) || typeof item.sourceId !== "string" || !externalIds.has(item.sourceId) || seenExternal.has(item.sourceId) || typeof item.adapterId !== "string" || !agentSources.has(item.adapterId) || (item.sourceId !== "codex-archived" && item.sourceId !== item.adapterId) || !["not_inspected", "not_present", "unavailable", "no_activity_records", "not_approved", "approved_not_parsed", "parsed", "failed"].includes(String(item.status)) || !["not_requested", "not_approved", "approved", "not_required"].includes(String(item.approvalStatus)) || !(item.discoveredFiles === null || count(item.discoveredFiles)) || !count(item.filesRead) || !count(item.sessionsMatched) || typeof item.limitation !== "string" || !safeString(item.limitation, 400) || /[A-Za-z]:\\|\/(?:Users|home)\//i.test(item.limitation)) return false;
    seenExternal.add(item.sourceId);
    if (item.status === "not_inspected" && (item.approvalStatus !== "not_requested" || item.discoveredFiles !== null || item.filesRead !== 0)) return false;
    if (["parsed", "approved_not_parsed", "failed"].includes(String(item.status)) && item.approvalStatus !== "approved") return false;
    if (item.status === "not_approved" && item.approvalStatus !== "not_approved") return false;
    if (item.status === "parsed" && item.discoveredFiles === null) return false;
  }
  const coverageFor = (sourceId: string) => agentCoverage.find((row) => row.sourceId === sourceId);
  for (const item of value.projectLocalSources) {
    if (item.sourceType !== "agent_activity") continue;
    const row = coverageFor(item.sourceId);
    if (item.inspectionStatus === "parsed" && (!row || item.filesRead !== row.filesRead || item.sessionsMatched !== row.matchedSessions)) return false;
    if (item.inspectionStatus !== "parsed" && item.sessionsMatched !== 0) return false;
  }
  for (const item of value.externalSources) {
    const row = coverageFor(item.sourceId);
    if (item.status === "parsed" && (!row || item.filesRead !== row.filesRead || item.sessionsMatched !== row.matchedSessions)) return false;
    if (item.status !== "parsed" && item.sessionsMatched !== 0) return false;
  }
  for (const item of value.detectedAgents) {
    const sessionPresent = agentCoverage.some((row) => row.adapterId === item.agentId && Number(row.matchedSessions) > 0);
    if (item.activityEvidenceObserved !== Boolean(sessionPresent)) return false;
  }
  return value.projectLocalSources.filter((item: unknown) => isRecord(item) && item.sourceType === "repository_history").length === 1;
}

function expectedDeveloperProfile(observations: ChronicleBehavioralObservation[], sessions: ChronicleSession[]): ChronicleDeveloperProfile {
  const eventToSession = new Map<string, string>();
  for (const session of sessions) for (const eventId of Array.isArray(session.sequenceSummary?.evidenceRefs) ? session.sequenceSummary.evidenceRefs : []) eventToSession.set(eventId, session.sessionKey);
  const areas = profileAreaDefinitions.map(([key, title]) => {
    const rows = observations.filter((item) => item.category === key);
    const available = rows.filter((item) => item.evidenceClassification !== "unavailable");
    const assessable = key === "agent_orchestration" ? available.filter((item) => item.signal === "developer_directed_orchestration") : available;
    const refs = [...new Set(available.flatMap((item) => item.evidenceRefs).filter(eventRef))].sort();
    const distinctSessions = [...new Set(refs.map((ref) => eventToSession.get(ref)).filter((item): item is string => Boolean(item)))].sort();
    const rank = assessable.length ? assessable.reduce((best, item) => Math.min(best, confidenceRanks[item.confidence] || 1), 3) : 0;
    const confidence = rank ? Object.keys(confidenceRanks).find((name) => confidenceRanks[name] === rank)! : "insufficient";
    const evidenceAvailable = rows.reduce((sum, item) => sum + Number(item.evidenceCoverage?.totalAvailable || 0), 0);
    const referencesIncluded = rows.reduce((sum, item) => sum + Number(item.evidenceCoverage?.referencesIncluded || 0), 0);
    const observedSummary = rows.length ? rows.slice(0, 6).map((item) => `[${item.evidenceClassification.toUpperCase()} · ${item.confidence.toUpperCase()}] ${item.description}`).join(" ") : "No supported observation is available in this report snapshot.";
    const summary = key === "agent_orchestration" && !assessable.length ? observedSummary + " [UNAVAILABLE · INSUFFICIENT] Developer-directed delegation cannot be established from agent/tool lifecycle records." : observedSummary;
    const limitations = [...new Set(rows.map((item) => item.limitations).filter(Boolean))].slice(0, 6);
    if (key === "agent_orchestration" && !assessable.length) limitations.push("Observed background lifecycle records identify tool or agent activity, not whether the developer initiated or coordinated delegation.");
    if (rows.some((item) => item.evidenceCoverage?.truncated)) limitations.push("Distinct sessions are a lower bound from included references; truncated references may omit additional sessions.");
    return {
      key, title, status: assessable.length ? "observed" : "not_assessed",
      summary,
      observationIds: rows.map((item) => item.observationId).sort(), evidenceRefs: refs.slice(0, 64), confidence,
      evidenceCoverage: { evidenceAvailable, referencesIncluded, coveragePercent: evidenceAvailable ? Math.round(referencesIncluded / evidenceAvailable * 10000) / 100 : 0 },
      distinctSessions: distinctSessions.length, limitations,
    } as ChronicleProfileArea;
  });
  // Event occurrence is not an outcome-quality judgement. No strength is inferred before a validated rubric exists.
  const strengths: ChronicleDeveloperProfile["strengths"] = [];
  const recurringPatterns = observations.flatMap((item) => {
    if (item.signal !== "correction_followups" || item.evidenceClassification !== "confirmed" && item.evidenceClassification !== "probable") return [];
    const distinctSessions = [...new Set(item.evidenceRefs.map((ref) => eventToSession.get(ref)).filter((entry): entry is string => Boolean(entry)))];
    return distinctSessions.length >= 2 ? [{ statement: item.description, category: item.category, confidence: item.confidence, distinctSessions: distinctSessions.length, observationIds: [item.observationId], evidenceRefs: item.evidenceRefs.slice(0, 32) }] : [];
  });
  const evidenceCaptureRecommendations = [];
  const verificationAttempt = observations.find((item) => item.signal === "verification_attempt");
  const verificationResult = observations.find((item) => item.signal === "verification_result");
  if (verificationAttempt && !verificationResult) evidenceCaptureRecommendations.push({ statement: "Recording explicit test or build outcomes would make verification evidence more informative; current evidence shows attempts only.", observationIds: [verificationAttempt.observationId], evidenceRefs: verificationAttempt.evidenceRefs.slice(0, 32) });
  const limitations = [];
  if (!strengths.length) limitations.push("No repeated, confirmed behavior in this snapshot meets Chronicle's conservative strength-evidence rule.");
  if (!recurringPatterns.length) limitations.push("Recurring patterns require evidence linked to at least two distinct sessions; timestamps or Git proximity alone are not enough.");
  limitations.push("Behavioral opportunities are not inferred from missing, heuristic, or unavailable evidence. No coaching rubric has been calibrated.");
  return { schemaVersion: 1, status: observations.some((item) => item.evidenceClassification !== "unavailable") ? "preliminary" : "insufficient_evidence", areas, strengths, recurringPatterns, improvementOpportunities: [], evidenceCaptureRecommendations, limitations };
}

// Schema-v7 reports created before profile labels were made explicit remain readable.
function expectedLegacyDeveloperProfile(observations: ChronicleBehavioralObservation[], sessions: ChronicleSession[]): ChronicleDeveloperProfile {
  const eventToSession = new Map<string,string>();
  for (const session of sessions) for (const ref of Array.isArray(session.sequenceSummary?.evidenceRefs) ? session.sequenceSummary.evidenceRefs : []) eventToSession.set(ref,session.sessionKey);
  const areas = profileAreaDefinitions.map(([key,title])=>{
    const rows=observations.filter((item)=>item.category===key), available=rows.filter((item)=>item.evidenceClassification!=="unavailable");
    const refs=[...new Set(available.flatMap((item)=>item.evidenceRefs).filter(eventRef))].sort();
    const distinctSessions=[...new Set(refs.map((ref)=>eventToSession.get(ref)).filter((item):item is string=>Boolean(item)))].sort();
    const rank=available.length?available.reduce((best,item)=>Math.min(best,confidenceRanks[item.confidence]||1),3):0;
    const confidence=rank?Object.keys(confidenceRanks).find((name)=>confidenceRanks[name]===rank)!:"insufficient";
    const evidenceAvailable=rows.reduce((sum,item)=>sum+Number(item.evidenceCoverage?.totalAvailable||0),0), referencesIncluded=rows.reduce((sum,item)=>sum+Number(item.evidenceCoverage?.referencesIncluded||0),0);
    return {key,title,status:available.length?"observed":"not_assessed",summary:available.length?available.map((item)=>item.description).slice(0,4).join(" "):rows.map((item)=>item.description).filter(Boolean).slice(0,2).join(" ")||"No supported observation is available in this report snapshot.",observationIds:rows.map((item)=>item.observationId).sort(),evidenceRefs:refs.slice(0,64),confidence,evidenceCoverage:{evidenceAvailable,referencesIncluded,coveragePercent:evidenceAvailable?Math.round(referencesIncluded/evidenceAvailable*10000)/100:0},distinctSessions:distinctSessions.length,limitations:[...new Set(rows.map((item)=>item.limitations).filter(Boolean))].slice(0,6)} as ChronicleProfileArea;
  });
  const strengths=observations.filter((item)=>item.evidenceClassification==="confirmed"&&["explicit_plan_events","correction_followups","explicit_orchestration","explicit_background_lifecycle"].includes(item.signal)&&item.evidenceRefs.length>=2&&item.confidence!=="low").map((item)=>({statement:item.description,category:item.category,confidence:item.confidence,observationIds:[item.observationId],evidenceRefs:item.evidenceRefs.slice(0,32)}));
  const recurringPatterns=observations.flatMap((item)=>{if(item.evidenceClassification==="unavailable")return[];const distinctSessions=[...new Set(item.evidenceRefs.map((ref)=>eventToSession.get(ref)).filter((entry):entry is string=>Boolean(entry)))];return distinctSessions.length>=2?[{statement:item.description,category:item.category,confidence:item.confidence,distinctSessions:distinctSessions.length,observationIds:[item.observationId],evidenceRefs:item.evidenceRefs.slice(0,32)}]:[];});
  const evidenceCaptureRecommendations=[];const attempt=observations.find((item)=>item.signal==="verification_attempt"),result=observations.find((item)=>item.signal==="verification_result");
  if(attempt&&!result)evidenceCaptureRecommendations.push({statement:"Recording explicit test or build outcomes would make verification evidence more informative; current evidence shows attempts only.",observationIds:[attempt.observationId],evidenceRefs:attempt.evidenceRefs.slice(0,32)});
  const limitations=[];if(!strengths.length)limitations.push("No repeated, confirmed behavior in this snapshot meets Chronicle's conservative strength-evidence rule.");if(!recurringPatterns.length)limitations.push("Recurring patterns require evidence linked to at least two distinct sessions; timestamps or Git proximity alone are not enough.");limitations.push("Behavioral opportunities are not inferred from missing, heuristic, or unavailable evidence. No coaching rubric has been calibrated.");
  return {schemaVersion:1,status:observations.some((item)=>item.evidenceClassification!=="unavailable")?"preliminary":"insufficient_evidence",areas,strengths,recurringPatterns,improvementOpportunities:[],evidenceCaptureRecommendations,limitations};
}

function validDeveloperProfile(value: unknown, observations: ChronicleBehavioralObservation[], sessions: ChronicleSession[]): boolean {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "status", "areas", "strengths", "recurringPatterns", "improvementOpportunities", "evidenceCaptureRecommendations", "limitations"]) || value.schemaVersion !== 1 || !Array.isArray(value.areas) || !Array.isArray(value.strengths) || !Array.isArray(value.recurringPatterns) || !Array.isArray(value.improvementOpportunities) || !Array.isArray(value.evidenceCaptureRecommendations) || !Array.isArray(value.limitations)) return false;
  return JSON.stringify(value) === JSON.stringify(expectedDeveloperProfile(observations, sessions)) || JSON.stringify(value) === JSON.stringify(expectedLegacyDeveloperProfile(observations, sessions));
}

/** Upgrade only facts that the server can recompute from the sanitized report itself. */
export function applyChronicleServerVerification(report: ChronicleReport): ChronicleReport {
  if (report.schemaVersion < 6 || !report.behavioralAnalysis) return report;
  const observations = report.behavioralAnalysis.observations.map((item) => {
    if (item.signal === "git_activity_only" && item.evidenceCount === report.git.commitIds.length && item.evidenceCoverage?.totalAvailable === report.git.commitIds.length && item.evidenceCoverage.referencesIncluded === item.evidenceRefs.length && item.evidenceRefs.every((ref) => report.git.commitIds.includes(ref))) {
      return { ...item, verificationStatus: "server_verified" as const };
    }
    return { ...item, verificationStatus: "locally_generated" as const };
  });
  const behavioralAnalysis = { ...report.behavioralAnalysis, observations };
  if (report.schemaVersion >= 7) return { ...report, behavioralAnalysis, developerProfile: expectedDeveloperProfile(observations, report.agents.sessions) };
  return { ...report, behavioralAnalysis };
}

function validEngineeringOutcomes(value: unknown, projectId: string, eventIds: Set<string>, sessionKeys: Set<string>, commitIds: Set<string>, referenceSources: Map<string,string>, episodes: ChronicleEpisode[]): boolean {
  if (!Array.isArray(value) || value.length > 512) return false;
  const ids = new Set<string>();
  const categories = new Set(["tool_execution", "git_commit", "correction", "plan_lifecycle"]);
  const sources = new Set(["claude-code", "codex", "gemini-cli", "aider", "git"]);
  for (const raw of value) {
    const keys = ["outcomeId", "category", "state", "activityRefs", "resultRefs", "provenance", "confidence", "evidenceClassification", "relationshipType", "limitations"];
    if (!isRecord(raw) || !exactKeys(raw, keys) || !eventRef(raw.outcomeId) || ids.has(String(raw.outcomeId)) || !categories.has(String(raw.category))) return false;
    ids.add(String(raw.outcomeId));
    const states: Record<string, string[]> = { tool_execution: ["passed", "failed", "unknown"], git_commit: ["committed"], correction: ["response_observed", "unresolved"], plan_lifecycle: ["created", "revised"] };
    if (!states[String(raw.category)]?.includes(String(raw.state)) || !["high", "medium", "low"].includes(String(raw.confidence)) || !["confirmed", "probable", "heuristic", "unavailable"].includes(String(raw.evidenceClassification)) || !["direct_reference", "inferred_association", "unlinked"].includes(String(raw.relationshipType)) || !safeString(raw.limitations, 320)) return false;
    if (!Array.isArray(raw.activityRefs) || raw.activityRefs.length > 32 || raw.activityRefs.some((ref: unknown) => !eventRef(ref) || (!eventIds.has(String(ref)) && !sessionKeys.has(String(ref)))) || new Set(raw.activityRefs).size !== raw.activityRefs.length) return false;
    if (!Array.isArray(raw.resultRefs) || raw.resultRefs.length > 32 || raw.resultRefs.some((ref: unknown) => !eventRef(ref) || (!eventIds.has(String(ref)) && !commitIds.has(String(ref)))) || new Set(raw.resultRefs).size !== raw.resultRefs.length) return false;
    if (!Array.isArray(raw.provenance) || raw.provenance.length > 8 || raw.provenance.some((entry: unknown) => !isRecord(entry) || !exactKeys(entry, ["sourceAdapter", "recordType"]) || !sources.has(String(entry.sourceAdapter)) || !adapterRecordType(String(entry.sourceAdapter), String(entry.recordType)))) return false;
    const activityRefs = raw.activityRefs as string[];
    const resultRefs = raw.resultRefs as string[];
    const provenance = raw.provenance as Array<{sourceAdapter:string;recordType:string}>;
    const provenanceSources = new Set(provenance.map((item) => item.sourceAdapter));
    for (const ref of activityRefs) { const source = referenceSources.get(ref); if (!source || !provenanceSources.has(source)) return false; }
    for (const ref of resultRefs) { const source = commitIds.has(ref) ? "git" : referenceSources.get(ref); if (!source || !provenanceSources.has(source)) return false; }
    if (raw.relationshipType === "unlinked" && activityRefs.length !== 0) return false;
    if (raw.category === "git_commit") {
      if (raw.state !== "committed" || resultRefs.length !== 1 || !commitIds.has(resultRefs[0]) || !provenance.some((entry) => entry.sourceAdapter === "git" && entry.recordType === "git_commit_metadata")) return false;
      const episode = episodes.find((item) => item.gitCommitRefs.includes(resultRefs[0]));
      if (raw.relationshipType === "direct_reference" && (!episode || !episode.groupingBasis.includes("explicit_commit_reference"))) return false;
      if (raw.relationshipType === "inferred_association" && (!episode || !episode.groupingBasis.some((basis) => ["multiple_shared_file_references", "same_explicit_branch_and_multiple_file_references"].includes(basis)))) return false;
    }
    if (raw.category === "tool_execution" && (raw.relationshipType !== "direct_reference" || activityRefs.length !== 1 || resultRefs.length !== 1 || !eventIds.has(activityRefs[0]) || !eventIds.has(resultRefs[0]))) return false;
    if (raw.category === "correction" && (activityRefs.length !== 1 || !eventIds.has(activityRefs[0]) || (raw.relationshipType === "inferred_association") !== (resultRefs.length > 0))) return false;
    const stable = [projectId, raw.category, raw.state, ...activityRefs, "->", ...resultRefs, raw.relationshipType].join("\0");
    const expectedId = createHash("sha256").update(`chronicle-engineering-outcome-v1\0${stable}`).digest("hex");
    if (raw.outcomeId !== expectedId) return false;
  }
  return true;
}

function validOutcomeCoverage(value: unknown, included: number): boolean {
  return isRecord(value) && exactKeys(value, ["totalAvailable", "referencesIncluded", "omitted", "truncated", "coveragePercent"]) && count(value.totalAvailable) && value.referencesIncluded === included && count(value.omitted) && value.omitted === Number(value.totalAvailable) - included && value.omitted >= 0 && typeof value.truncated === "boolean" && value.truncated === (value.omitted > 0) && Number.isFinite(value.coveragePercent) && value.coveragePercent === (Number(value.totalAvailable) ? Math.round(included / Number(value.totalAvailable) * 10000) / 100 : 0);
}

export function validateChronicleReport(input: unknown): { ok: true; report: ChronicleReport } | { ok: false; message: string } {
  if (!isRecord(input)) return { ok: false, message: "Choose a valid Chronicle report JSON file." };
  const value = input;
  const version = value.schemaVersion;
  if ((version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8) || !exactKeys(value, version === 8 ? ROOT_KEYS_V8 : version === 7 ? ROOT_KEYS_V7 : version === 6 ? ROOT_KEYS_V6 : version === 5 ? ROOT_KEYS_V5 : version === 4 ? ROOT_KEYS_V4 : ROOT_KEYS)) return { ok: false, message: "This report version is not supported or contains fields Chronicle won't upload." };
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
  const dimensions = version >= 3
    ? ["planning", "ai_steering", "execution_leverage", "engineering_quality", "product_thinking"]
    : ["planning", "technical_understanding", "verification", "steering", "coordination"];
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== dimensions.length || value.dimensions.some((row: unknown, index: number) => {
    if (!isRecord(row) || row.key !== dimensions[index] || row.score !== null || row.status !== "insufficient_evidence") return true;
    if (value.schemaVersion === 2) return !exactKeys(row, ["key", "score", "status", "evidence"]) || !Array.isArray(row.evidence) || row.evidence.length !== 0;
    const signal = (item: unknown) => typeof item === "string" && /^[a-z0-9_]{1,64}$/.test(item);
    return !exactKeys(row, ["key", "score", "status", "evidenceCount", "confidence", "explanation", "positiveSignals", "improvementOpportunities", "evidenceRefs"])
      || !count(row.evidenceCount) || row.confidence !== "insufficient" || !safeString(row.explanation, 400)
      || !Array.isArray(row.positiveSignals) || row.positiveSignals.length > 16 || row.positiveSignals.some((item: unknown) => !signal(item))
      || !Array.isArray(row.improvementOpportunities) || row.improvementOpportunities.length > 8 || row.improvementOpportunities.some((item: unknown) => !signal(item))
      || !Array.isArray(row.evidenceRefs) || row.evidenceRefs.length > 32 || row.evidenceRefs.some((item: unknown) => typeof item !== "string" || !/^[a-f0-9]{64}$/.test(item));
  })) return { ok: false, message: "Scoring fields must remain unassigned unless evidence supports them." };
  const contribution = value.contribution;
  if (!isRecord(contribution) || !exactKeys(contribution, ["manual", "aiAssisted", "collaborative", "unclassified"]) || contribution.manual !== "unknown" || contribution.aiAssisted !== "unknown" || contribution.collaborative !== "unknown" || contribution.unclassified !== "git_activity_only") return { ok: false, message: "Contribution classifications are invalid." };
  const agents = value.agents;
  if (!isRecord(agents) || !exactKeys(agents, ["sessions", "sourceCoverage", "metrics", "claim"]) || !Array.isArray(agents.sessions) || agents.sessions.length > 1000 || !Array.isArray(agents.sourceCoverage) || agents.sourceCoverage.length > 8 || typeof agents.claim !== "string" || !agentClaims.has(agents.claim)) return { ok: false, message: "Agent evidence is invalid." };
  if (agents.sessions.length > 0 && !["implemented", "partial"].includes(String(availability.agentSessions))) return { ok: false, message: "Session summaries require implemented session-source coverage." };
  const sessionKeys = new Set<string>();
  const sessionEventIds = new Set<string>();
  const referenceSources = new Map<string, string>();
  for (const row of agents.sessions) {
    const expectedSessionKeys = version >= 3 ? SESSION_KEYS_V3 : SESSION_KEYS_V2;
    if (!isRecord(row) || !exactKeys(row, expectedSessionKeys) || typeof row.sessionKey !== "string" || !/^[a-f0-9]{64}$/.test(row.sessionKey) || sessionKeys.has(row.sessionKey) || typeof row.source !== "string" || !agentSources.has(row.source) || row.association !== "exact_root" || row.evidence !== "confirmed" || !time(row.startedAt) || !time(row.endedAt) || !nullableCount(row.durationSeconds) || !["userTurns", "assistantTurns", "promptWordCount", "planningSignals", "correctionSignals", "toolCallCount", "failureSignals", "recoverySignals"].every((key) => count(row[key])) || !Array.isArray(row.toolKinds) || row.toolKinds.length > 20 || row.toolKinds.some((item) => typeof item !== "string" || !toolKinds.has(item)) || !Array.isArray(row.models) || row.models.length > 8 || row.models.some((item) => !validModel(item)) || (version >= 3 && !validSequenceSummary(row.sequenceSummary))) return { ok: false, message: "Agent session summary is invalid or contains unsupported data." };
    sessionKeys.add(row.sessionKey);
    referenceSources.set(row.sessionKey, String(row.source));
    if (version >= 3 && isRecord(row.sequenceSummary) && Array.isArray(row.sequenceSummary.evidenceRefs)) for (const eventId of row.sequenceSummary.evidenceRefs) if (eventRef(eventId)) { sessionEventIds.add(eventId); referenceSources.set(eventId, String(row.source)); }
  }
  for (const id of git.commitIds as string[]) referenceSources.set(id, "git");
  for (const row of agents.sourceCoverage) if (!isRecord(row) || !exactKeys(row, COVERAGE_KEYS) || typeof row.sourceId !== "string" || !sourceIds.has(row.sourceId) || typeof row.adapterId !== "string" || !agentSources.has(row.adapterId) || (row.sourceId !== "codex-archived" && row.sourceId !== row.adapterId) || !safeString(row.adapterVersion, 20) || row.format !== adapterFormats[row.adapterId] || !["estimatedFiles", "filesRead", "matchedSessions", "skippedFiles"].every((key) => count(row[key]))) return { ok: false, message: "Agent source coverage is invalid." };
  if (version >= 4) {
    const episodes = value.episodes;
    const commitIds = new Set(git.commitIds as string[]);
    if (!Array.isArray(episodes) || episodes.length > 1_000 || episodes.some((episode: unknown) => !validEpisode(episode, project.localProjectId as string, sessionKeys, commitIds, version === 8))) return { ok: false, message: "Engineering episode analysis is invalid or contains unsupported data." };
    const episodeIds = new Set<string>();
    const groupedSessions = new Set<string>();
    const groupedCommits = new Set<string>();
    for (const episode of episodes as ChronicleEpisode[]) {
      if (episodeIds.has(episode.episodeId) || episode.sessionRefs.some((item) => groupedSessions.has(item.sessionKey)) || episode.gitCommitRefs.some((item) => groupedCommits.has(item))) return { ok: false, message: "Engineering episode references must be unique." };
      episodeIds.add(episode.episodeId);
      episode.sessionRefs.forEach((item) => groupedSessions.add(item.sessionKey));
      episode.gitCommitRefs.forEach((item) => groupedCommits.add(item));
    }
    if (!validUnassignedActivity(value.unassignedActivity, sessionKeys, commitIds, groupedSessions, groupedCommits)) return { ok: false, message: "Unassigned engineering activity is invalid." };
    const unassigned = value.unassignedActivity as ChronicleReport["unassignedActivity"];
    if (new Set([...groupedSessions, ...(unassigned?.sessionRefs.map((item) => item.sessionKey) || [])]).size !== sessionKeys.size || new Set([...groupedCommits, ...(unassigned?.gitCommitRefs || [])]).size !== commitIds.size) return { ok: false, message: "Engineering episode grouping must account for all sessions and commits exactly once." };
  }
  if ((version === 5 || version === 6 || version === 7 || version === 8) && !validBehavioralAnalysis(value.behavioralAnalysis, project.localProjectId as string, sessionKeys, new Set(git.commitIds as string[]), sessionEventIds, version, referenceSources)) return { ok: false, message: "Developer behavioral observations are invalid or contain unsupported data." };
  const metricSets = { sourceCounts: new Set(["claude-code", "codex", "gemini-cli", "aider"]), modelCounts: new Set((agents.sessions as Array<{models:string[]}>).flatMap((row) => row.models)), toolCounts: toolKinds };
  const metrics = agents.metrics;
  if (!isRecord(metrics) || !exactKeys(metrics, METRIC_KEYS) || metrics.sessionCount !== agents.sessions.length || !objectCounts(metrics.sourceCounts, metricSets.sourceCounts) || !objectCounts(metrics.modelCounts, metricSets.modelCounts) || !objectCounts(metrics.toolCounts, metricSets.toolCounts) || !["planningSignals", "correctionSignals", "toolCalls", "sessionsWithDuration", "maxConcurrentSessions", "failureSignals", "recoverySignals", "sessionDays", "gitCommitsOnSessionDays", "overlappingGitDays"].every((key) => count(metrics[key])) || !nullableCount(metrics.averagePromptWords) || !nullableCount(metrics.longestSessionSeconds) || metrics.correlationNote !== correlationNote) return { ok: false, message: "Agent analysis metrics are invalid." };
  const privacy = value.privacy;
  if (!isRecord(privacy) || !exactKeys(privacy, ["rawSourceCodeIncluded", "rawDiffsIncluded", "commitMessagesIncluded", "authorIdentitiesIncluded", "absoluteProjectPathIncluded", "rawAgentTranscriptsIncluded", "rawPromptTextIncluded", "rawToolOutputIncluded"]) || Object.values(privacy).some((flag) => flag !== false)) return { ok: false, message: "This file is not marked as a privacy-safe Chronicle report." };
  if (version >= 7 && (!validSourceInventory(value.sourceInventory, agents.sourceCoverage) || !validDeveloperProfile(value.developerProfile, (value.behavioralAnalysis as ChronicleReport["behavioralAnalysis"])!.observations, agents.sessions as ChronicleSession[]))) return { ok: false, message: "Source coverage or developer profile references are invalid." };
  if (version === 8 && (!validEngineeringOutcomes(value.engineeringOutcomes, project.localProjectId as string, sessionEventIds, sessionKeys, new Set(git.commitIds as string[]), referenceSources, value.episodes as ChronicleEpisode[]) || !validOutcomeCoverage(value.engineeringOutcomeCoverage, (value.engineeringOutcomes as unknown[]).length))) return { ok: false, message: "Engineering outcome evidence or coverage is invalid or references unsupported activity." };
  if (version === 8) {
    const outcomes = value.engineeringOutcomes as ChronicleEngineeringOutcome[];
    for (const episode of value.episodes as ChronicleEpisode[]) {
      const episodeRefs = new Set([...episode.evidenceRefs, ...episode.sessionRefs.map((item) => item.sessionKey)]);
      const expected = outcomes.filter((item) => item.activityRefs.some((ref) => episodeRefs.has(ref)) || item.resultRefs.some((ref) => episode.gitCommitRefs.includes(ref))).map((item) => item.outcomeId).sort();
      if (JSON.stringify(episode.outcomeRefs) !== JSON.stringify(expected)) return { ok: false, message: "Engineering episode outcome links do not match the report outcome evidence." };
    }
  }
  if (!safeString(value.developmentStory, 800) || (version >= 3 && value.developmentStory !== buildChronicleDevelopmentStory(value as unknown as ChronicleReport))) return { ok: false, message: "Report narrative is invalid or does not match its validated evidence." };
  return { ok: true, report: value as unknown as ChronicleReport };
}

export function chronicleSnapshotHash(report: ChronicleReport): string {
  const sessions = report.agents.sessions.map((session) => ({
    sessionKey: session.sessionKey, source: session.source,
    evidenceRefs: [...(session.sequenceSummary?.evidenceRefs as string[] || [])].sort(),
    startedAt: session.startedAt, endedAt: session.endedAt, durationSeconds: session.durationSeconds,
    userTurns: session.userTurns, assistantTurns: session.assistantTurns, toolCallCount: session.toolCallCount,
    toolKinds: [...session.toolKinds].sort(), models: [...session.models].sort(),
  })).sort((a,b)=>a.sessionKey.localeCompare(b.sessionKey));
  const observations = (report.behavioralAnalysis?.observations || []).map((item) => ({
    observationId: item.observationId, category: item.category, signal: item.signal,
    evidenceRefs: [...item.evidenceRefs].sort(), evidenceClassification: item.evidenceClassification,
    confidence: item.confidence, evidenceCoverage: item.evidenceCoverage,
  })).sort((a,b)=>a.observationId.localeCompare(b.observationId));
  const episodes = (report.episodes || []).map((item) => ({ episodeId:item.episodeId, evidenceRefs:[...item.evidenceRefs].sort() })).sort((a,b)=>a.episodeId.localeCompare(b.episodeId));
  const stable = JSON.stringify({
    schemaVersion: report.schemaVersion, projectId: report.project.localProjectId,
    commits: [...report.git.commitIds].sort(), sessions, observations, episodes,
    sourceAvailability: report.sourceAvailability,
    sourceCoverage: [...report.agents.sourceCoverage].sort((a,b)=>String(a.sourceId).localeCompare(String(b.sourceId))),
    sourceInventory: report.schemaVersion >= 7 ? report.sourceInventory : undefined,
    engineeringOutcomes: report.schemaVersion === 8 ? report.engineeringOutcomes : undefined,
    engineeringOutcomeCoverage: report.schemaVersion === 8 ? report.engineeringOutcomeCoverage : undefined,
  });
  return createHash("sha256").update(stable).digest("hex");
}
