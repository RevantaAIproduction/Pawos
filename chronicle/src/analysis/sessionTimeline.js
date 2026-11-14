const agentActions = new Set(["assistant_response", "tool_call", "subagent_dispatch", "plan_create", "plan_update"]);

const references = (events) => events.map((event) => event.eventId);

/** Deterministic event-order analysis. Claims point only to normalized event IDs. */
export function analyzeSessionTimeline(events, { truncated = false } = {}) {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence || a.sourceSequence - b.sourceSequence);
  const firstPrompt = ordered.find((event) => event.type === "user_prompt" || event.type === "developer_correction");
  const firstTool = ordered.find((event) => event.type === "tool_call");
  const planningEvents = ordered.filter((event) => event.signals.includes("planning_language") || event.type === "plan_create" || event.type === "plan_update");
  const corrections = ordered.filter((event) => event.type === "developer_correction");
  const correctionFollowUps = corrections.flatMap((correction) => {
    const next = ordered.find((event) => event.sequence > correction.sequence && agentActions.has(event.type));
    return next ? [{ correctionEventId: correction.eventId, followUpEventId: next.eventId, sequenceGap: next.sequence - correction.sequence }] : [];
  });
  const calls = ordered.filter((event) => event.type === "tool_call");
  const results = ordered.filter((event) => event.type === "tool_result");
  const failures = ordered.filter((event) => event.outcome === "failure" || event.type === "error");
  const recoveries = failures.flatMap((failure) => {
    const success = ordered.find((event) => event.sequence > failure.sequence && event.type === "tool_result" && event.outcome === "success");
    return success ? [{ failureEventId: failure.eventId, laterSuccessEventId: success.eventId, sameToolCall: Boolean(success.parentEventId && success.parentEventId === failure.parentEventId) }] : [];
  });
  const explicitEnd = ordered.find((event) => event.type === "session_end" && event.attribution === "observed");
  const models = ordered.filter((event) => event.type === "model_change" || (event.modelIdentifier && ["session_start", "assistant_response", "tool_call"].includes(event.type)));
  const modelSequence = [];
  for (const event of models) if (event.modelIdentifier && modelSequence.at(-1)?.modelIdentifier !== event.modelIdentifier) modelSequence.push({ modelIdentifier: event.modelIdentifier, eventId: event.eventId });
  const dispatches = ordered.filter((event) => event.type === "subagent_dispatch");
  const returns = ordered.filter((event) => event.type === "subagent_return");
  const background = ordered.filter((event) => ["background_execution_start", "background_execution_end"].includes(event.type));
  const missingTimestampCount = ordered.filter((event) => !event.timestamp).length;
  return {
    schemaVersion: 1,
    eventCount: ordered.length,
    truncated,
    initialIntent: firstPrompt ? {
      eventId: firstPrompt.eventId,
      classification: firstPrompt.signals.find((signal) => signal.startsWith("intent_"))?.slice(7) || "unclassified",
      confidence: firstPrompt.confidence,
    } : null,
    planningBeforeFirstTool: firstTool && planningEvents.length ? planningEvents.some((event) => event.sequence < firstTool.sequence) : null,
    planningEvidence: references(planningEvents),
    firstToolCallEventId: firstTool?.eventId ?? null,
    toolCallCount: calls.length,
    toolResultCount: results.length,
    correctionCount: corrections.length,
    correctionFollowUps,
    failureEventIds: references(failures),
    failureToSuccessSequences: recoveries,
    explicitCompletionEventId: explicitEnd?.eventId ?? null,
    completionStatus: explicitEnd ? explicitEnd.outcome : "not_observed",
    modelSequence,
    subagentDispatchEventIds: references(dispatches),
    subagentReturnEventIds: references(returns),
    backgroundEventIds: references(background),
    missingTimestampCount,
    orderingBasis: "source_sequence_preserved",
  };
}

export function describeSessionTimeline(analysis) {
  const claims = [];
  if (analysis.initialIntent) claims.push(`The first recorded user instruction is classified as ${analysis.initialIntent.classification} (derived category only).`);
  if (analysis.planningBeforeFirstTool === true) claims.push("Planning evidence appears before the first recorded tool call.");
  else if (analysis.planningBeforeFirstTool === false) claims.push("Planning language was observed, but not before the first recorded tool call.");
  if (analysis.correctionFollowUps.length) claims.push(`${analysis.correctionFollowUps.length} developer correction(s) were followed by a later agent response or tool action.`);
  if (analysis.toolCallCount) claims.push(`${analysis.toolCallCount} tool call(s) were observed with ${analysis.toolResultCount} recorded result(s).`);
  if (analysis.failureToSuccessSequences.length) claims.push(`${analysis.failureToSuccessSequences.length} failure-to-later-success sequence(s) were observed; task resolution is not established.`);
  if (analysis.modelSequence.length > 1) claims.push(`Model identifiers changed ${analysis.modelSequence.length - 1} time(s) during the recorded sequence.`);
  if (analysis.subagentDispatchEventIds.length || analysis.subagentReturnEventIds.length) claims.push(`${analysis.subagentDispatchEventIds.length} explicit subagent dispatch(es) and ${analysis.subagentReturnEventIds.length} return(s) were recorded.`);
  if (analysis.backgroundEventIds.length) claims.push(`${analysis.backgroundEventIds.length} background-execution event(s) were explicitly recorded.`);
  if (analysis.completionStatus !== "not_observed") claims.push(`The adapter recorded an explicit session completion (${analysis.completionStatus}).`);
  if (analysis.missingTimestampCount) claims.push(`${analysis.missingTimestampCount} event(s) lacked usable timestamps; source order was preserved.`);
  if (!claims.length) claims.push("The adapter preserved event order, but this session did not contain enough typed evidence for a behavioral interpretation.");
  return claims.join(" ");
}

/** Small, text-free summary suitable for user-approved cloud report DTOs. */
export function summarizeSessionTimeline(analysis, events = []) {
  return {
    schemaVersion: 1,
    initialIntent: analysis.initialIntent?.classification ?? null,
    planningBeforeFirstTool: analysis.planningBeforeFirstTool,
    planningEvidenceRefs: analysis.planningEvidence.slice(0, 32),
    firstToolCallEventId: analysis.firstToolCallEventId,
    toolCallCount: analysis.toolCallCount,
    toolResultCount: analysis.toolResultCount,
    correctionCount: analysis.correctionCount,
    correctionFollowUpCount: analysis.correctionFollowUps.length,
    failureCount: analysis.failureEventIds.length,
    recoveryCount: analysis.failureToSuccessSequences.length,
    completionStatus: analysis.completionStatus,
    modelChangeCount: Math.max(0, analysis.modelSequence.length - 1),
    modelSequence: analysis.modelSequence.slice(0, 8).map((item) => ({ modelIdentifier: item.modelIdentifier, eventId: item.eventId })),
    subagentDispatchCount: analysis.subagentDispatchEventIds.length,
    subagentReturnCount: analysis.subagentReturnEventIds.length,
    backgroundEventCount: analysis.backgroundEventIds.length,
    missingTimestampCount: analysis.missingTimestampCount,
    eventCount: analysis.eventCount,
    truncated: analysis.truncated,
    evidenceRefs: [...new Set([
      ...events.map((event) => event.eventId),
      ...analysis.planningEvidence,
      analysis.firstToolCallEventId,
      ...analysis.correctionFollowUps.flatMap((item) => [item.correctionEventId, item.followUpEventId]),
      ...analysis.failureEventIds,
      ...analysis.failureToSuccessSequences.flatMap((item) => [item.failureEventId, item.laterSuccessEventId]),
      ...analysis.modelSequence.map((item) => item.eventId),
      ...analysis.subagentDispatchEventIds,
      ...analysis.subagentReturnEventIds,
    ].filter(Boolean))].slice(0, 3_000),
  };
}
