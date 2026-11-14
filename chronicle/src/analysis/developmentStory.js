const number = (value) => Number(value || 0).toLocaleString("en-US");

export function buildDimensionAssessments(report) {
  const sessions = report.agents.sessions;
  const metrics = report.agents.metrics;
  const testChanges = report.git.fileCategories.find((item) => item.category === "test")?.changes ?? 0;
  const planning = Number(metrics.planningSignals || 0);
  const corrections = Number(metrics.correctionSignals || 0);
  const verificationTools = Number(metrics.toolCounts?.verification || 0);
  const sessionRefs = (predicate) => sessions.filter(predicate).map((session) => session.sessionKey).slice(0, 32);
  const definitions = [
    ["planning", planning, planning ? ["planning_language_observed"] : [], "Planning language is counted, but ordering before implementation and follow-through are not normalized; no score is assigned.", sessionRefs((session) => session.planningSignals > 0)],
    ["ai_steering", corrections, corrections ? ["correction_language_observed"] : [], "Correction language is counted, but the agent response and resulting outcome are not linked; no score is assigned.", sessionRefs((session) => session.correctionSignals > 0)],
    ["execution_leverage", sessions.reduce((sum, session) => sum + (session.toolCallCount ? 1 : 0), 0), sessions.some((session) => session.toolCallCount) ? ["agent_tool_activity_observed"] : [], "Tool activity indicates recorded agent actions, not useful output or developer leverage; no score is assigned.", sessionRefs((session) => session.toolCallCount > 0)],
    ["engineering_quality", verificationTools + testChanges, verificationTools || testChanges ? [...(verificationTools ? ["verification_tool_kind_observed"] : []), ...(testChanges ? ["test_file_changes_observed"] : [])] : [], "Verification-related tool types and test-file changes do not establish that tests ran or passed; no score is assigned.", [...sessionRefs((session) => session.toolKinds.includes("verification")), ...(testChanges ? [report.project.localProjectId] : [])].slice(0, 32)],
    ["product_thinking", 0, [], "The current adapters do not normalize product decision evidence into a validated signal; no score is assigned.", []],
  ];
  return definitions.map(([key, evidenceCount, observedSignals, explanation, evidenceRefs]) => ({
    key, score: null, status: "insufficient_evidence", evidenceCount,
    confidence: "insufficient", explanation, positiveSignals: observedSignals, improvementOpportunities: [], evidenceRefs,
  }));
}

/** Builds a privacy-safe, deterministic account of observable activity. It does not infer authorship. */
export function buildDevelopmentStory(report) {
  const git = report.git;
  const agents = report.agents;
  const sessions = agents.sessions;
  const metrics = agents.metrics;
  const parts = [git.commitCount
    ? `Git records ${number(git.commitCount)} commits, ${number(git.fileChanges)} file-change records, +${number(git.insertions)} insertions and −${number(git.deletions)} deletions for ${report.project.displayName}. Git metadata does not establish who authored this work.`
    : `No Git commits were available for ${report.project.displayName}; Chronicle cannot infer manual or AI contribution from an empty history.`];
  if (!sessions.length) {
    parts.push("No supported, approved agent sessions were matched. Chronicle therefore leaves AI use, collaboration and behavioral assessment unassigned.");
    return parts.join(" ").slice(0, 800);
  }
  parts.push(`${number(sessions.length)} approved local agent sessions were observed across ${number(Object.keys(metrics.sourceCounts).length)} supported tool source(s).`);
  const timelines = sessions.map((session) => session.timelineAnalysis).filter(Boolean);
  const plannedBeforeAction = timelines.filter((item) => item.planningBeforeFirstTool === true).length;
  if (plannedBeforeAction) parts.push(`${number(plannedBeforeAction)} session(s) show planning evidence before the first recorded tool action, based on source order.`);
  const steered = timelines.reduce((sum, item) => sum + item.correctionFollowUps.length, 0);
  if (steered) parts.push(`${number(steered)} correction(s) were followed by a later agent action in the recorded sequence.`);
  const explicitSubagents = timelines.reduce((sum, item) => sum + item.subagentDispatchEventIds.length, 0);
  if (explicitSubagents) parts.push(`${number(explicitSubagents)} explicit subagent dispatch event(s) were recorded; independent child-session linkage is reported only where the source provides it.`);
  const modelChanges = timelines.reduce((sum, item) => sum + Math.max(0, item.modelSequence.length - 1), 0);
  if (modelChanges) parts.push(`${number(modelChanges)} in-session model change(s) were observed.`);
  const failures = timelines.reduce((sum, item) => sum + item.failureEventIds.length, 0);
  const recoveries = timelines.reduce((sum, item) => sum + item.failureToSuccessSequences.length, 0);
  if (failures) parts.push(`${number(failures)} explicit failure event(s) were observed.`);
  if (recoveries) parts.push(`${number(recoveries)} failure-to-later-success sequence(s) were observed; task resolution is not established.`);
  const verification = Number(metrics.toolCounts.verification || 0);
  if (verification) parts.push(`${number(verification)} verification-related tool interaction(s) were recorded, without a confirmed test/build outcome.`);
  if (Object.keys(metrics.modelCounts).length) parts.push(`Recorded model identifiers include ${Object.keys(metrics.modelCounts).sort().slice(0, 3).join(", ")}.`);
  parts.push("Git/session date overlap is temporal context only and does not establish authorship, handoffs or collaborative work.");
  return parts.join(" ").slice(0, 800);
}

export function sessionObservations(session) {
  const observations = [];
  if (session.planningSignals) observations.push(`${number(session.planningSignals)} planning-language signal(s)`);
  if (session.correctionSignals) observations.push(`${number(session.correctionSignals)} correction-language signal(s)`);
  if (session.toolKinds.includes("verification")) observations.push("verification-related tool observed");
  if (session.failureSignals) observations.push(`${number(session.failureSignals)} explicit failure signal(s)`);
  return observations;
}
