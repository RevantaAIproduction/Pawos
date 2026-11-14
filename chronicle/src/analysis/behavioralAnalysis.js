import { createHash } from "node:crypto";

export const BEHAVIORAL_ANALYSIS_SCHEMA_VERSION = 2;
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const SOURCE_ORDER = ["claude-code", "codex", "gemini-cli", "git"];

const definitions = {
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

function sourceSort(values) {
  return [...new Set(values)].sort((a, b) => (SOURCE_ORDER.indexOf(a) < 0 ? 99 : SOURCE_ORDER.indexOf(a)) - (SOURCE_ORDER.indexOf(b) < 0 ? 99 : SOURCE_ORDER.indexOf(b)) || a.localeCompare(b));
}

function observation(projectId, signal, events = [], { count = events.length, sourceAdapters = [], extraRefs = [], unavailableReason = "evidence_absent" } = {}) {
  const definition = definitions[signal];
  const allRefs = [...new Set([...events.map((event) => event.eventId), ...extraRefs])].filter((ref) => /^[a-f0-9]{64}$/.test(ref)).sort();
  const refs = allRefs.slice(0, 32);
  const adapterSet = sourceSort([...sourceAdapters, ...events.map((event) => event.sourceAdapter)]);
  const adapter = adapterSet.length > 1 ? "multiple" : adapterSet[0] || "chronicle";
  const provenance = sourceSort(events.map((event) => event.sourceAdapter)).map((sourceAdapter) => ({
    sourceAdapter,
    recordTypes: [...new Set(events.filter((event) => event.sourceAdapter === sourceAdapter).map((event) => event.provenance?.recordType).filter((value) => typeof value === "string"))].sort().slice(0, 8),
  }));
  if (!provenance.length) for (const sourceAdapter of adapterSet.length ? adapterSet : [adapter]) provenance.push({ sourceAdapter, recordTypes: sourceAdapter === "git" ? ["git_commit_metadata"] : [] });
  const observedCount = definition.classification === "unavailable" ? 0 : Math.max(0, Math.min(100_000, count));
  const stable = `${projectId}\0${signal}\0${(adapterSet.length ? adapterSet : [adapter]).join(",")}\0${refs.join(",")}`;
  const totalAvailable = definition.classification === "unavailable" ? 0 : allRefs.length;
  const referencesIncluded = refs.length;
  const evidenceCoverage = {
    totalAvailable,
    referencesIncluded,
    omitted: Math.max(0, totalAvailable - referencesIncluded),
    truncated: totalAvailable > referencesIncluded,
    coveragePercent: totalAvailable ? Math.round((referencesIncluded / totalAvailable) * 10000) / 100 : 0,
    source: adapter,
    category: definition.category,
    unavailableReason: definition.classification === "unavailable" ? unavailableReason : "not_applicable",
  };
  return {
    observationId: hash(`chronicle-behavior-v1\0${stable}`),
    category: definition.category,
    signal,
    evidenceCount: observedCount,
    description: definition.describe(observedCount),
    evidenceRefs: refs,
    evidenceCoverage,
    verificationStatus: "locally_generated",
    sourceAdapter: adapter,
    provenance,
    confidence: definition.confidence,
    evidenceClassification: definition.classification,
    limitations: definition.limitations,
  };
}

function makeObserved(projectId, signal, events, extra = {}) {
  return events.length ? [observation(projectId, signal, events, extra)] : [];
}

/**
 * Deterministic, text-free interpretation layer over normalized session events and Git metadata.
 * It describes evidence availability and sequence, never source-code authorship.
 */
export function analyzeDeveloperBehavior(report) {
  const projectId = report.project.localProjectId;
  const sessions = report.agents.sessions || [];
  const events = sessions.flatMap((session) => session.events || []);
  const refs = (typeOrPredicate) => events.filter(typeof typeOrPredicate === "function" ? typeOrPredicate : (event) => event.type === typeOrPredicate);
  const grouped = [];

  const planEvents = refs((event) => (event.type === "plan_create" || event.type === "plan_update") && event.sourceAdapter === "codex" && /^event_msg\.plan_(create|update|delta)$/.test(event.provenance?.recordType || ""));
  const planToolEvents = refs((event) => (event.type === "plan_create" || event.type === "plan_update") && !planEvents.includes(event));
  const planningLanguage = refs((event) => event.signals.includes("planning_language"));
  grouped.push(...makeObserved(projectId, "explicit_plan_events", planEvents));
  grouped.push(...makeObserved(projectId, "plan_tool_indicators", planToolEvents));
  grouped.push(...makeObserved(projectId, "planning_language", planningLanguage));
  const sessionClaim = String(report.agents.claim || "").toLowerCase();
  const sessionUnavailableReason = sessionClaim.includes("not approved") ? "not_approved" : /could not|couldn't|failed|unavailable/.test(sessionClaim) ? "source_unavailable" : "evidence_absent";
  grouped.push(observation(projectId, "task_decomposition_unavailable", [], { sourceAdapters: sourceSort(sessions.map((session) => session.source)), unavailableReason: sessionUnavailableReason }));

  const planUpdates = planEvents.filter((event) => event.type === "plan_update");
  const planToolUpdates = planToolEvents.filter((event) => event.type === "plan_update");
  grouped.push(...makeObserved(projectId, "plan_revisions", planUpdates));
  grouped.push(...makeObserved(projectId, "plan_tool_revisions", planToolUpdates));
  grouped.push(observation(projectId, "alternatives_unavailable", [], { sourceAdapters: sourceSort(sessions.map((session) => session.source)), unavailableReason: sessionUnavailableReason }));

  const corrections = refs("developer_correction");
  const lexicalCorrections = corrections.filter((event) => event.signals.includes("correction_language"));
  const explicitCorrections = corrections.filter((event) => !event.signals.includes("correction_language"));
  grouped.push(...makeObserved(projectId, "correction_events", explicitCorrections));
  grouped.push(...makeObserved(projectId, "correction_language", lexicalCorrections));
  const correctionEventIds = new Set(corrections.map((event) => event.eventId));
  const followupRefs = sessions.flatMap((session) => (session.timelineAnalysis?.correctionFollowUps || []).filter((item) => correctionEventIds.has(item.correctionEventId)).flatMap((item) => [item.correctionEventId, item.followUpEventId]));
  grouped.push(...(followupRefs.length ? [observation(projectId, "correction_followups", events.filter((event) => followupRefs.includes(event.eventId)), { count: followupRefs.length / 2 })] : []));

  const activeSessions = sessions.filter((session) => (session.events || []).some((event) => !["session_start", "session_end"].includes(event.type)));
  grouped.push(...(activeSessions.length ? [observation(projectId, "ai_session_activity", activeSessions.flatMap((session) => session.events || []).filter((event) => !["session_start", "session_end"].includes(event.type)), { count: activeSessions.length, extraRefs: activeSessions.map((session) => session.sessionKey) })] : []));
  const commitIds = report.git.commitIds || [];
  grouped.push(...(commitIds.length ? [observation(projectId, "git_activity_only", [], { count: commitIds.length, extraRefs: commitIds, sourceAdapters: ["git"] })] : []));
  grouped.push(observation(projectId, "manual_authorship_unavailable", [], { sourceAdapters: ["git"] }));
  grouped.push(observation(projectId, "ai_authorship_unavailable", [], { sourceAdapters: sessions.map((session) => session.source) }));
  grouped.push(observation(projectId, "hybrid_authorship_unavailable", [], { sourceAdapters: ["git", ...sessions.map((session) => session.source)] }));

  const orchestration = refs((event) => ["subagent_dispatch", "subagent_return", "inter_agent_message"].includes(event.type));
  const background = refs((event) => ["background_execution_start", "background_execution_end"].includes(event.type));
  grouped.push(...makeObserved(projectId, "explicit_orchestration", orchestration));
  grouped.push(...makeObserved(projectId, "explicit_background_lifecycle", background));
  if (!orchestration.length && !background.length) grouped.push(observation(projectId, "orchestration_unavailable", [], { sourceAdapters: sourceSort(sessions.map((session) => session.source)), unavailableReason: sessionUnavailableReason }));

  const verification = refs((event) => event.toolCategory === "verification" && event.type === "tool_call");
  const verificationCalls = new Set(verification.map((event) => event.eventId));
  const verificationResults = refs((event) => event.type === "tool_result" && event.parentEventId && verificationCalls.has(event.parentEventId) && event.outcome !== "unknown" && event.outcome !== "none");
  grouped.push(...makeObserved(projectId, "verification_attempt", verification));
  grouped.push(...makeObserved(projectId, "verification_result", verificationResults));
  if (!verification.length) grouped.push(observation(projectId, "verification_unavailable", [], { sourceAdapters: sourceSort(sessions.map((session) => session.source)), unavailableReason: sessionUnavailableReason }));

  const failures = refs((event) => event.type === "error" || event.outcome === "failure");
  const recoveries = refs("recovery");
  grouped.push(...makeObserved(projectId, "failure_events", failures));
  grouped.push(...makeObserved(projectId, "later_success_signals", recoveries));

  const productLanguage = refs((event) => event.signals.includes("product_context_language"));
  grouped.push(...makeObserved(projectId, "product_language", productLanguage));
  grouped.push(observation(projectId, "product_decisions_unavailable", [], { sourceAdapters: sourceSort(sessions.map((session) => session.source)), unavailableReason: sessionUnavailableReason }));

  const unique = new Map();
  for (const item of grouped) unique.set(item.observationId, item);
  const observations = [...unique.values()].sort((a, b) => a.category.localeCompare(b.category) || a.signal.localeCompare(b.signal) || a.observationId.localeCompare(b.observationId)).slice(0, 64);
  const evidenceAvailable = observations.reduce((sum, item) => sum + item.evidenceCoverage.totalAvailable, 0);
  const referencesIncluded = observations.reduce((sum, item) => sum + item.evidenceCoverage.referencesIncluded, 0);
  const referencesOmitted = observations.reduce((sum, item) => sum + item.evidenceCoverage.omitted, 0);
  return { schemaVersion: BEHAVIORAL_ANALYSIS_SCHEMA_VERSION, evidenceCoverage: { totalObservations: observations.length, unavailableObservations: observations.filter((item) => item.evidenceClassification === "unavailable").length, truncatedObservations: observations.filter((item) => item.evidenceCoverage.truncated).length, evidenceAvailable, referencesIncluded, referencesOmitted, referenceCoveragePercent: evidenceAvailable ? Math.round(referencesIncluded / evidenceAvailable * 10000) / 100 : 0, countingBasis: "per_observation; references may support multiple observations" }, observations };
}

export function behaviorSignalDefinitions() { return definitions; }
