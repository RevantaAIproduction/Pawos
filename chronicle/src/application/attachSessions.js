export function attachSessionEvidence(report, sourceResults, { unapprovedSourceCount = 0 } = {}) {
  const unique = new Map();
  for (const result of sourceResults) for (const session of result.sessions) unique.set(session.sessionKey, session);
  const sessions = [...unique.values()].sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || "")).slice(-1000);
  const modelCounts = new Map(), sourceCounts = new Map(), toolCounts = new Map();
  let promptWords = 0, userTurns = 0, planningSignals = 0, correctionSignals = 0, toolCalls = 0, failures = 0, recoveries = 0;
  for (const session of sessions) {
    sourceCounts.set(session.source, (sourceCounts.get(session.source) || 0) + 1);
    for (const model of session.models) modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    for (const kind of session.toolKinds) toolCounts.set(kind, (toolCounts.get(kind) || 0) + 1);
    promptWords += session.promptWordCount; userTurns += session.userTurns; planningSignals += session.planningSignals;
    correctionSignals += session.correctionSignals; toolCalls += session.toolCallCount;
    failures += session.failureSignals; recoveries += session.recoverySignals;
  }
  const durations = sessions.map((item) => item.durationSeconds).filter(Number.isSafeInteger).sort((a, b) => a - b);
  const sessionDays = new Set(sessions.map((item) => item.startedAt?.slice(0, 10)).filter(Boolean));
  const sameDayGitActivity = report.git.activityByDay.filter((item) => sessionDays.has(item.day)).reduce((sum, item) => sum + item.commits, 0);
  const sessionCommitDays = report.git.activityByDay.filter((item) => sessionDays.has(item.day)).length;
  const edges = sessions.flatMap((item) => item.startedAt && item.endedAt
    ? [{ at: Date.parse(item.startedAt), delta: 1 }, { at: Date.parse(item.endedAt), delta: -1 }]
    : []).sort((a, b) => a.at - b.at || a.delta - b.delta);
  let concurrent = 0, maxConcurrentSessions = 0;
  for (const edge of edges) { concurrent += edge.delta; maxConcurrentSessions = Math.max(maxConcurrentSessions, concurrent); }
  report.sourceAvailability.agentSessions = unapprovedSourceCount ? "partial" : sessions.length ? "implemented" : "unavailable";
  report.agents = {
    sessions,
    sourceCoverage: sourceResults.map((item) => ({
      sourceId: item.sourceId, adapterId: item.adapterId, adapterVersion: item.adapterVersion,
      format: item.format, estimatedFiles: item.estimatedFiles, filesRead: item.filesRead,
      matchedSessions: item.matched, skippedFiles: item.skipped,
    })),
    metrics: {
      sessionCount: sessions.length, sourceCounts: Object.fromEntries([...sourceCounts].sort()),
      modelCounts: Object.fromEntries([...modelCounts].sort()), averagePromptWords: userTurns ? Math.round(promptWords / userTurns) : null,
      planningSignals, correctionSignals, toolCalls, toolCounts: Object.fromEntries([...toolCounts].sort()),
      longestSessionSeconds: durations.length ? durations.at(-1) : null,
      sessionsWithDuration: durations.length, maxConcurrentSessions, failureSignals: failures, recoverySignals: recoveries,
      sessionDays: sessionDays.size, gitCommitsOnSessionDays: sameDayGitActivity, overlappingGitDays: sessionCommitDays,
      correlationNote: "Date overlap is temporal context only. It does not attribute commits or changes to a person or agent.",
    },
    claim: sessions.length
      ? "Confirmed local agent-session records were analyzed after approval. Transcript text was used only in memory for derived counts and is not retained in this report."
      : unapprovedSourceCount
        ? "Supported source locations were found but not approved for transcript reading. No external session contents were read."
        : "No supported, repository-associated session records were included. An installed agent is not evidence of use.",
  };
  if (sessions.length) {
    report.developmentStory += " Chronicle also analyzed " + sessions.length + " approved local agent sessions associated with this repository. Session and Git dates are shown as temporal context only; they do not establish authorship.";
  }
  return report;
}
