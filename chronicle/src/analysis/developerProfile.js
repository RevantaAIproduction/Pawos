const AREA_DEFINITIONS = [
  ["planning", "Planning approach"],
  ["technical_decision", "Technical decision-making"],
  ["ai_steering", "AI steering"],
  ["execution_approach", "Execution approach"],
  ["agent_orchestration", "Agent orchestration"],
  ["verification", "Verification habits"],
  ["failure_recovery", "Failure and recovery"],
  ["product_thinking", "Product thinking"],
];
const confidenceRank = { high: 3, medium: 2, low: 1 };
const hashRef = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** A deterministic, report-scoped profile built only from validated Chronicle observations. */
export function buildDeveloperProfile(report) {
  const observations = report.behavioralAnalysis?.observations || [];
  const eventToSession = new Map();
  for (const session of report.agents.sessions || []) {
    const refs = session.sequenceSummary?.evidenceRefs;
    for (const eventId of Array.isArray(refs) ? refs : []) eventToSession.set(eventId, session.sessionKey);
  }
  const areas = AREA_DEFINITIONS.map(([key, title]) => {
    const rows = observations.filter((item) => item.category === key);
    const available = rows.filter((item) => item.evidenceClassification !== "unavailable");
    const assessable = key === "agent_orchestration" ? available.filter((item) => item.signal === "developer_directed_orchestration") : available;
    const refs = [...new Set(available.flatMap((item) => item.evidenceRefs || []).filter(hashRef))].sort();
    const sessions = [...new Set(refs.map((ref) => eventToSession.get(ref)).filter(Boolean))].sort();
    const strongestConfidence = assessable.length
      ? assessable.reduce((best, item) => Math.min(best, confidenceRank[item.confidence] || 1), 3)
      : 0;
    const confidence = strongestConfidence ? Object.keys(confidenceRank).find((name) => confidenceRank[name] === strongestConfidence) : "insufficient";
    const evidenceAvailable = rows.reduce((sum, item) => sum + Number(item.evidenceCoverage?.totalAvailable || 0), 0);
    const referencesIncluded = rows.reduce((sum, item) => sum + Number(item.evidenceCoverage?.referencesIncluded || 0), 0);
    const coveragePercent = evidenceAvailable ? Math.round(referencesIncluded / evidenceAvailable * 10000) / 100 : 0;
    const observedSummary = rows.length
      ? rows.slice(0, 6).map((item) => `[${item.evidenceClassification.toUpperCase()} · ${item.confidence.toUpperCase()}] ${item.description}`).join(" ")
      : "No supported observation is available in this report snapshot.";
    const summary = key === "agent_orchestration" && !assessable.length
      ? observedSummary + " [UNAVAILABLE · INSUFFICIENT] Developer-directed delegation cannot be established from agent/tool lifecycle records."
      : observedSummary;
    const limitations = [...new Set(rows.map((item) => item.limitations).filter(Boolean))].slice(0, 6);
    if (key === "agent_orchestration" && !assessable.length) limitations.push("Observed background lifecycle records identify tool or agent activity, not whether the developer initiated or coordinated delegation.");
    if (rows.some((item) => item.evidenceCoverage?.truncated)) limitations.push("Distinct sessions are a lower bound from included references; truncated references may omit additional sessions.");
    return {
      key, title, status: assessable.length ? "observed" : "not_assessed", summary,
      observationIds: rows.map((item) => item.observationId).sort(), evidenceRefs: refs.slice(0, 64),
      confidence, evidenceCoverage: { evidenceAvailable, referencesIncluded, coveragePercent },
      distinctSessions: sessions.length,
      limitations,
    };
  });

  // Recorded events prove that an event happened, not that the behavior was effective or a strength.
  // Keep this empty until Chronicle has validated positive outcome criteria.
  const strengths = [];
  const recurringPatterns = observations.flatMap((item) => {
    // Only a direct human-steering sequence is currently safe to call a recurring developer pattern.
    // Agent error volume, background activity, session volume, and lexical hints are evidence, not habits.
    if (item.signal !== "correction_followups" || !["confirmed", "probable"].includes(item.evidenceClassification)) return [];
    const sessions = [...new Set((item.evidenceRefs || []).map((ref) => eventToSession.get(ref)).filter(Boolean))];
    return sessions.length >= 2 ? [{ statement: item.description, category: item.category, confidence: item.confidence, distinctSessions: sessions.length, observationIds: [item.observationId], evidenceRefs: item.evidenceRefs.slice(0, 32) }] : [];
  });
  const improvementOpportunities = [];
  const evidenceCaptureRecommendations = [];
  const verificationAttempt = observations.find((item) => item.signal === "verification_attempt");
  const verificationResult = observations.find((item) => item.signal === "verification_result");
  if (verificationAttempt && !verificationResult) evidenceCaptureRecommendations.push({
    statement: "Recording explicit test or build outcomes would make verification evidence more informative; current evidence shows attempts only.",
    observationIds: [verificationAttempt.observationId], evidenceRefs: verificationAttempt.evidenceRefs.slice(0, 32),
  });
  const limitations = [];
  if (!strengths.length) limitations.push("No repeated, confirmed behavior in this snapshot meets Chronicle's conservative strength-evidence rule.");
  if (!recurringPatterns.length) limitations.push("Recurring patterns require evidence linked to at least two distinct sessions; timestamps or Git proximity alone are not enough.");
  limitations.push("Behavioral opportunities are not inferred from missing, heuristic, or unavailable evidence. No coaching rubric has been calibrated.");
  return {
    schemaVersion: 1,
    status: observations.some((item) => item.evidenceClassification !== "unavailable") ? "preliminary" : "insufficient_evidence",
    areas,
    strengths,
    recurringPatterns,
    improvementOpportunities,
    evidenceCaptureRecommendations,
    limitations,
  };
}

export const developerProfileAreas = () => AREA_DEFINITIONS.map(([key, title]) => ({ key, title }));
