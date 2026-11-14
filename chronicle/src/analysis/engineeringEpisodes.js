import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const knownCategories = new Set(["test", "ci", "implementation", "documentation", "configuration", "other"]);
const basisLabels = {
  explicit_session_parent_link: "an explicit parent-child session link",
  explicit_inter_agent_relationship: "an explicit agent-to-agent session relationship",
  shared_explicit_task_reference: "a shared explicit task reference",
  same_explicit_branch_and_multiple_file_references: "an explicit branch plus multiple matching file references",
  explicit_commit_reference: "an explicit Git commit reference from the session metadata",
  multiple_shared_file_references: "multiple matching file references between a session and Git history",
  single_session_observed_sequence: "a prompt followed by an observed tool action in one session",
};
const eventRefs = (session, types) => (session.events || []).filter((event) => types.includes(event.type)).map((event) => event.eventId);
const overlap = (left = [], right = []) => [...new Set(left)].filter((item) => new Set(right).has(item));

function sessionEvidence(session, projectId) {
  const events = session.events || [];
  return {
    session,
    key: session.sessionKey,
    repositoryIdentity: events[0]?.repositoryIdentity || projectId,
    parentSessionIds: events.map((event) => event.parentSessionId).filter(Boolean),
    relatedSessionIds: session.explicitRelatedSessionIds || [],
    taskRefs: session.taskReferenceHashes || [],
    branchIdentity: session.branchIdentity || null,
    fileRefs: session.fileReferenceHashes || [],
    commitRefs: session.relatedCommitReferences || [],
  };
}

function coherentSingleSession(item) {
  const events = item.session.events || [];
  return events.some((event) => ["user_prompt", "developer_correction"].includes(event.type))
    && events.some((event) => ["tool_call", "subagent_dispatch"].includes(event.type));
}

function compareSessions(left, right) {
  if (left.repositoryIdentity !== right.repositoryIdentity) return null;
  if (left.parentSessionIds.includes(right.key) || right.parentSessionIds.includes(left.key)) return ["explicit_session_parent_link", "high"];
  if (left.relatedSessionIds.includes(right.key) || right.relatedSessionIds.includes(left.key)) return ["explicit_inter_agent_relationship", "high"];
  if (overlap(left.taskRefs, right.taskRefs).length) return ["shared_explicit_task_reference", "high"];
  if (left.branchIdentity && left.branchIdentity === right.branchIdentity && overlap(left.fileRefs, right.fileRefs).length >= 2) return ["same_explicit_branch_and_multiple_file_references", "medium"];
  return null;
}

function compareSessionCommit(session, commit) {
  if (session.repositoryIdentity !== commit.repositoryIdentity) return null;
  if (overlap(session.commitRefs, commit.commitReferenceHashes).length) return ["explicit_commit_reference", "high"];
  if (overlap(session.fileRefs, commit.fileReferenceHashes).length >= 2) return ["multiple_shared_file_references", "medium"];
  return null;
}

function makeUnionFind(keys) {
  const parent = new Map(keys.map((key) => [key, key]));
  const find = (key) => { const value = parent.get(key); if (value === key) return key; const root = find(value); parent.set(key, root); return root; };
  const join = (left, right) => { const a = find(left), b = find(right); if (a !== b) parent.set(b, a); };
  return { find, join };
}

function toEpisode({ projectId, sessions, commits, links }) {
  const episodeSessions = sessions.map((item) => item.session).sort((a, b) => a.sessionKey.localeCompare(b.sessionKey));
  const episodeCommits = commits.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.commitId.localeCompare(b.commitId));
  const sessionEvents = episodeSessions.flatMap((session) => session.events || []);
  const sessionTimes = episodeSessions.flatMap((session) => [
    ...(session.startedAt ? [{ timestamp: session.startedAt, precision: (session.events || []).find((event) => event.timestamp === session.startedAt)?.timestampPrecision || "unknown" }] : []),
    ...(session.endedAt ? [{ timestamp: session.endedAt, precision: (session.events || []).find((event) => event.timestamp === session.endedAt)?.timestampPrecision || "unknown" }] : []),
  ]);
  const commitTimes = episodeCommits.filter((commit) => commit.timestamp).map((commit) => ({ timestamp: commit.timestamp, precision: commit.timestampPrecision || "unknown" }));
  const allTimes = [...sessionTimes, ...commitTimes].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sequence = [];
  const add = (type, refs) => { if (refs.length) sequence.push({ type, count: refs.length, evidenceRefs: [...new Set(refs)].slice(0, 32) }); };
  add("planning", sessionEvents.filter((event) => event.type === "plan_create" || event.type === "plan_update" || event.signals.includes("planning_language")).map((event) => event.eventId));
  add("agent_execution", sessionEvents.filter((event) => ["tool_call", "subagent_dispatch", "assistant_response"].includes(event.type)).map((event) => event.eventId));
  add("agent_delegation", sessionEvents.filter((event) => event.type === "inter_agent_message").map((event) => event.eventId));
  add("background_execution", sessionEvents.filter((event) => ["background_execution_start", "background_execution_end"].includes(event.type)).map((event) => event.eventId));
  add("developer_correction", sessionEvents.filter((event) => event.type === "developer_correction").map((event) => event.eventId));
  add("failure", sessionEvents.filter((event) => event.type === "error" || event.outcome === "failure").map((event) => event.eventId));
  add("later_success_signal", sessionEvents.filter((event) => event.type === "recovery").map((event) => event.eventId));
  add("verification_tool", sessionEvents.filter((event) => event.toolCategory === "verification").map((event) => event.eventId));
  add("git_activity", episodeCommits.map((commit) => commit.commitId));
  const commitCategories = episodeCommits.flatMap((commit) => commit.fileCategories || []);
  const categories = [...new Set(commitCategories.filter((item) => knownCategories.has(item)))].sort();
  const allEvidenceRefs = [...new Set([
    ...sessionEvents.map((event) => event.eventId),
    ...episodeCommits.map((commit) => commit.commitId),
  ])].slice(0, 128);
  let remainingEventBudget = 300;
  const eventSequences = episodeSessions.map((session) => {
    const relevant = (session.events || []).filter((event) => ["session_start", "session_end", "user_prompt", "developer_correction", "assistant_response", "tool_call", "tool_result", "model_change", "plan_create", "plan_update", "subagent_dispatch", "subagent_return", "background_execution_start", "background_execution_end", "inter_agent_message", "error", "recovery"].includes(event.type)).sort((a, b) => a.sequence - b.sequence);
    const events = relevant.slice(0, Math.max(0, Math.min(100, remainingEventBudget)));
    remainingEventBudget -= events.length;
    return { sessionKey: session.sessionKey, source: session.source, eventCount: relevant.length, truncated: events.length < relevant.length, events: events.map((event) => ({ sequence: event.sequence, type: event.type, timestamp: event.timestamp, timestampPrecision: event.timestampPrecision, actor: event.actor, outcome: event.outcome, evidenceRef: event.eventId })) };
  });
  const eventSequenceTruncated = eventSequences.some((item) => item.truncated);
  const bases = [...new Set(links.map((link) => link.basis))].sort();
  const taskIntent = episodeSessions.map((session) => session.sequenceSummary?.initialIntent).find((item) => item && item !== "unclassified") || null;
  const title = categories.includes("test") ? "Testing and implementation activity"
    : categories.includes("implementation") ? "Implementation activity"
      : categories.includes("documentation") ? "Documentation activity"
        : taskIntent === "debug" ? "Investigation activity"
          : episodeSessions.length > 1 ? "Linked development activity" : "Development activity";
  const confidence = links.some((link) => link.confidence === "high") ? "high" : links.length ? "medium" : "low";
  const sessionNames = [...new Set(episodeSessions.map((session) => session.source))].sort();
  const corrections = sessionEvents.filter((event) => event.type === "developer_correction").length;
  const failures = sessionEvents.filter((event) => event.type === "error" || event.outcome === "failure").length;
  const recoveries = sessionEvents.filter((event) => event.type === "recovery").length;
  const verificationCount = sessionEvents.filter((event) => event.toolCategory === "verification").length;
  const episodeId = hash(`chronicle-episode-v1\0${projectId}\0${episodeSessions.map((session) => session.sessionKey).sort().join("\0")}\0${episodeCommits.map((commit) => commit.commitId).sort().join("\0")}`);
  const episode = {
    schemaVersion: 1,
    episodeId,
    repositoryIdentity: projectId,
    title,
    narrative: "",
    intentClassification: taskIntent,
    startedAt: allTimes[0]?.timestamp || null,
    endedAt: allTimes.at(-1)?.timestamp || null,
    startedAtPrecision: allTimes[0]?.precision || "unknown",
    endedAtPrecision: allTimes.at(-1)?.precision || "unknown",
    sessionRefs: episodeSessions.map((session) => ({ sessionKey: session.sessionKey, source: session.source })),
    participatingAgentTypes: sessionNames,
    gitCommitRefs: episodeCommits.map((commit) => commit.commitId),
    changedFileCategories: categories,
    sequence,
    eventSequences,
    eventSequenceTruncated,
    correctionCount: corrections,
    failureCount: failures,
    laterSuccessSignalCount: recoveries,
    verificationEventCount: verificationCount,
    completionStatus: "unknown",
    confidence,
    groupingBasis: bases.length ? bases : ["single_session_observed_sequence"],
    evidenceRefs: allEvidenceRefs,
  };
  episode.narrative = buildEngineeringEpisodeNarrative(episode);
  return episode;
}

export function buildEngineeringEpisodeNarrative(episode) {
  const linked = episode.sessionRefs.length > 1 || episode.gitCommitRefs.length > 0;
  const bases = episode.groupingBasis.map((basis) => basisLabels[basis]).filter(Boolean);
  const parts = [`Chronicle groups this as ${linked ? "linked" : "single-session"} development activity using ${bases.join(" and ") || "an observed prompt-to-tool sequence"}.`];
  if (episode.intentClassification) parts.push(`The first recorded instruction was classified as ${episode.intentClassification}; this is a derived category, not a retained task description.`);
  parts.push(`${episode.participatingAgentTypes.join(", ") || "No agent source"} session evidence is included${episode.gitCommitRefs.length ? ` with ${episode.gitCommitRefs.length} directly corroborated Git commit(s)` : " without a directly linked Git commit"}.`);
  if (episode.correctionCount) parts.push(`${episode.correctionCount} correction event(s) were observed.`);
  if (episode.failureCount || episode.laterSuccessSignalCount) parts.push(`${episode.failureCount} failure event(s) and ${episode.laterSuccessSignalCount} later-success signal(s) were recorded; task resolution is unknown.`);
  if (episode.verificationEventCount) parts.push(`${episode.verificationEventCount} verification-related tool event(s) were observed; this does not establish a passing test or build.`);
  parts.push("Episode completion is unknown unless an independent task-completion record is available.");
  return parts.join(" ").slice(0, 800);
}

/** Deterministic grouping. Time proximity is intentionally never an edge criterion. */
export function buildEngineeringEpisodes(report) {
  const projectId = report.project.localProjectId;
  const uniqueSessions = new Map();
  for (const session of report.agents.sessions) uniqueSessions.set(session.sessionKey, session);
  const sessions = [...uniqueSessions.values()].map((session) => sessionEvidence(session, projectId));
  const uniqueCommits = new Map();
  for (const commit of report.git.episodeCommitEvidence || []) uniqueCommits.set(commit.commitId, commit);
  const commits = [...uniqueCommits.values()].map((commit) => ({ ...commit, repositoryIdentity: projectId }));
  const keys = [...sessions.map((item) => `s:${item.key}`), ...commits.map((item) => `c:${item.commitId}`)];
  const union = makeUnionFind(keys);
  const links = [];
  for (let leftIndex = 0; leftIndex < sessions.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < sessions.length; rightIndex++) {
      const edge = compareSessions(sessions[leftIndex], sessions[rightIndex]);
      if (!edge) continue;
      union.join(`s:${sessions[leftIndex].key}`, `s:${sessions[rightIndex].key}`);
      links.push({ left: `s:${sessions[leftIndex].key}`, right: `s:${sessions[rightIndex].key}`, basis: edge[0], confidence: edge[1] });
    }
  }
  for (const session of sessions) for (const commit of commits) {
    const edge = compareSessionCommit(session, commit);
    if (!edge) continue;
    union.join(`s:${session.key}`, `c:${commit.commitId}`);
    links.push({ left: `s:${session.key}`, right: `c:${commit.commitId}`, basis: edge[0], confidence: edge[1] });
  }
  const groups = new Map();
  for (const item of sessions) {
    const root = union.find(`s:${item.key}`);
    if (!groups.has(root)) groups.set(root, { sessions: [], commits: [], links: [] });
    groups.get(root).sessions.push(item);
  }
  for (const commit of commits) {
    const root = union.find(`c:${commit.commitId}`);
    if (!groups.has(root)) groups.set(root, { sessions: [], commits: [], links: [] });
    groups.get(root).commits.push(commit);
  }
  for (const link of links) {
    const root = union.find(link.left);
    groups.get(root)?.links.push(link);
  }
  return [...groups.values()]
    .filter((group) => group.sessions.length && (group.sessions.length > 1 || group.commits.length || coherentSingleSession(group.sessions[0])))
    .map((group) => toEpisode({ projectId, ...group }))
    .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || "") || a.episodeId.localeCompare(b.episodeId));
}

export function summarizeUnassignedEngineeringActivity(report, episodes) {
  const groupedSessions = new Set(episodes.flatMap((episode) => episode.sessionRefs.map((item) => item.sessionKey)));
  const groupedCommits = new Set(episodes.flatMap((episode) => episode.gitCommitRefs));
  const sessionRefs = [...new Map(report.agents.sessions.map((session) => [session.sessionKey, session])).values()]
    .filter((session) => !groupedSessions.has(session.sessionKey))
    .map((session) => ({ sessionKey: session.sessionKey, source: session.source }));
  const gitCommitRefs = (report.git.episodeCommitEvidence || []).map((commit) => commit.commitId).filter((id) => !groupedCommits.has(id));
  return { schemaVersion: 1, sessionRefs, gitCommitRefs, reason: "insufficient_linkage_evidence" };
}
