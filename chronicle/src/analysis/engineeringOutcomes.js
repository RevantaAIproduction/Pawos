import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const validRef = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uniqRefs = (items) => [...new Set(items.filter(validRef))].sort().slice(0, 32);

function makeOutcome(projectId, { category, state, activityRefs = [], resultRefs = [], sourceRecords = [], confidence, evidenceClassification, relationshipType, limitations }) {
  const activity = uniqRefs(activityRefs), results = uniqRefs(resultRefs);
  const provenance = [...new Map(sourceRecords.filter((item) => item && typeof item.sourceAdapter === "string" && typeof item.recordType === "string")
    .map((item) => [`${item.sourceAdapter}:${item.recordType}`, { sourceAdapter: item.sourceAdapter, recordType: item.recordType }])).values()]
    .sort((a, b) => a.sourceAdapter.localeCompare(b.sourceAdapter) || a.recordType.localeCompare(b.recordType)).slice(0, 8);
  const stable = [projectId, category, state, ...activity, "->", ...results, relationshipType].join("\0");
  return { outcomeId: hash(`chronicle-engineering-outcome-v1\0${stable}`), category, state, activityRefs: activity, resultRefs: results, provenance, confidence, evidenceClassification, relationshipType, limitations };
}

/**
 * Extracts only observable lifecycle records. It does not turn shell/tool success into a
 * test/build pass, and it never links activity by time proximity.
 */
function collectEngineeringOutcomes(report) {
  const projectId = report.project.localProjectId;
  const events = (report.agents?.sessions || []).flatMap((session) => session.events || []);
  const eventById = new Map(events.map((event) => [event.eventId, event]));
  const outcomes = [];

  // Exact source parent IDs connect an adapter's call and result. This is a tool-operation
  // outcome only; adapters discard arguments/output, so verification semantics are unknown.
  for (const result of events.filter((event) => event.type === "tool_result" && event.parentEventId)) {
    const call = eventById.get(result.parentEventId);
    if (!call || !["tool_call", "plan_update", "subagent_dispatch"].includes(call.type)) continue;
    const state = result.outcome === "success" ? "passed" : result.outcome === "failure" ? "failed" : "unknown";
    outcomes.push(makeOutcome(projectId, {
      category: "tool_execution", state, activityRefs: [call.eventId], resultRefs: [result.eventId],
      sourceRecords: [call, result].map((event) => ({ sourceAdapter: event.sourceAdapter, recordType: event.provenance?.recordType })),
      confidence: state === "unknown" ? "low" : "high", evidenceClassification: state === "unknown" ? "unavailable" : "confirmed",
      relationshipType: "direct_reference",
      limitations: "The adapter directly linked a tool result to its call. A successful tool operation does not establish that a test, build, type-check, review, or task succeeded.",
    }));
  }

  // Git commits remain outcomes in their own right. Episode links are explicit only when
  // the adapter recorded a commit reference; file-overlap links remain inferred.
  const commitToEpisode = new Map();
  for (const episode of report.episodes || []) for (const commitRef of episode.gitCommitRefs || []) commitToEpisode.set(commitRef, episode);
  for (const commitRef of report.git?.commitIds || []) {
    const episode = commitToEpisode.get(commitRef);
    const basis = episode?.groupingBasis || [];
    const linkedSessions = episode?.sessionRefs || [];
    const direct = linkedSessions.some((sessionRef) => (report.agents?.sessions || []).find((session) => session.sessionKey === sessionRef.sessionKey)?.relatedCommitReferences?.includes(commitRef));
    const inferred = basis.some((item) => ["multiple_shared_file_references", "same_explicit_branch_and_multiple_file_references"].includes(item));
    const supportedSessions = episode && (direct || inferred) ? linkedSessions : [];
    const activityRefs = supportedSessions.map((session) => session.sessionKey);
    const sessionRecords = supportedSessions.map((item) => (report.agents?.sessions || []).find((session) => session.sessionKey === item.sessionKey)).filter(Boolean);
    outcomes.push(makeOutcome(projectId, {
      category: "git_commit", state: "committed", activityRefs, resultRefs: [commitRef],
      sourceRecords: [{ sourceAdapter: "git", recordType: "git_commit_metadata" }, ...sessionRecords.map((session) => ({ sourceAdapter: session.source, recordType: ({ "claude-code": "session_boundary", codex: "session_meta", "gemini-cli": "conversation_metadata", aider: "aider.session_start_marker" })[session.source] }))],
      confidence: direct ? "high" : inferred ? "medium" : "high", evidenceClassification: direct || !supportedSessions.length ? "confirmed" : "probable",
      relationshipType: direct ? "direct_reference" : inferred ? "inferred_association" : "unlinked",
      limitations: supportedSessions.length ? "A Git commit is observed. Its relationship to session activity is explicit or inferred from repository evidence; this does not establish human or agent authorship, review, merge, or acceptance." : "A Git commit is observed without a supported session relationship. No authorship, review, merge, or acceptance is established.",
    }));
  }

  // Correction response is a sequence observation, never a resolution claim.
  for (const session of report.agents?.sessions || []) {
    const ordered = [...(session.events || [])].sort((a, b) => a.sequence - b.sequence);
    for (let index = 0; index < ordered.length; index++) {
      const correction = ordered[index];
      if (correction.type !== "developer_correction") continue;
      const nextCorrection = ordered.findIndex((event, next) => next > index && event.type === "developer_correction");
      const end = nextCorrection < 0 ? ordered.length : nextCorrection;
      const responses = ordered.slice(index + 1, end).filter((event) => ["assistant_response", "tool_call", "tool_result", "subagent_dispatch", "error"].includes(event.type));
      const responseRefs = responses.map((event) => event.eventId);
      const lexicalOnly = correction.confidence === "low" || correction.signals?.includes("correction_language");
      const correctionClassification = lexicalOnly ? "heuristic" : correction.confidence === "high" ? "confirmed" : "probable";
      outcomes.push(makeOutcome(projectId, {
        category: "correction", state: responseRefs.length ? "response_observed" : "unresolved",
        activityRefs: [correction.eventId], resultRefs: responseRefs,
        sourceRecords: [correction, ...responses].map((event) => ({ sourceAdapter: event.sourceAdapter, recordType: event.provenance?.recordType })),
        confidence: lexicalOnly ? "low" : responseRefs.length ? "medium" : correction.confidence === "high" ? "high" : "medium", evidenceClassification: lexicalOnly ? "heuristic" : responseRefs.length ? "probable" : correctionClassification,
        relationshipType: responseRefs.length ? "inferred_association" : "direct_reference",
        limitations: responseRefs.length ? "A later event in source order was observed. Relevance and whether the correction was addressed or independently verified are unknown." : "The correction event is recorded, but no subsequent response or related activity appears in the retained session sequence.",
      }));
    }
  }

  // Explicit plan lifecycle records exist in Codex. Plan content is not retained; execution,
  // deviation, completion, and product decisions therefore remain unknown and unlinked.
  for (const event of events.filter((item) => ["plan_create", "plan_update"].includes(item.type) && item.sourceAdapter === "codex" && /^event_msg\.plan_(create|update|delta)$/.test(item.provenance?.recordType || ""))) {
    const priorPlan = events.some((item) => item.sessionId === event.sessionId && item.type === "plan_create" && item.sequence < event.sequence);
    outcomes.push(makeOutcome(projectId, {
      category: "plan_lifecycle", state: priorPlan || event.type === "plan_update" ? "revised" : "created",
      activityRefs: [event.eventId], resultRefs: [], sourceRecords: [{ sourceAdapter: event.sourceAdapter, recordType: event.provenance.recordType }],
      confidence: "high", evidenceClassification: "confirmed", relationshipType: "direct_reference",
      limitations: "Codex explicitly records plan creation or update. Plan text is not retained, so decomposition, execution linkage, deviation, and completion cannot be assessed.",
    }));
  }

  const unique = new Map(outcomes.map((item) => [item.outcomeId, item]));
  return [...unique.values()].sort((a, b) => a.category.localeCompare(b.category) || a.outcomeId.localeCompare(b.outcomeId));
}

export function analyzeEngineeringOutcomes(report) { return collectEngineeringOutcomes(report).slice(0, 512); }

export function buildEngineeringOutcomeEvidence(report) {
  const all = collectEngineeringOutcomes(report);
  const outcomes = all.slice(0, 512);
  return { outcomes, coverage: { totalAvailable: all.length, referencesIncluded: outcomes.length, omitted: all.length - outcomes.length, truncated: all.length > outcomes.length, coveragePercent: all.length ? Math.round(outcomes.length / all.length * 10000) / 100 : 0 } };
}

export function outcomeAvailabilitySummary(outcomes = []) {
  const counts = {};
  for (const item of outcomes) counts[`${item.category}:${item.state}`] = (counts[`${item.category}:${item.state}`] || 0) + 1;
  return { total: outcomes.length, counts, verification: "unavailable_from_current_adapters", reviewAndCi: "unavailable_from_current_adapters", productDecisionEvidence: "unavailable_from_current_adapters" };
}
