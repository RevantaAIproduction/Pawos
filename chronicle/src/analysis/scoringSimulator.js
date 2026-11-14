const DIMENSIONS = ["planning", "ai_steering", "execution_leverage", "engineering_quality", "product_thinking"];
const PRESETS = {
  conservative: { minimumCoverage: 0.9, minimumSessions: 5, minimumEpisodes: 3, minimumConfidence: "high" },
  balanced: { minimumCoverage: 0.8, minimumSessions: 3, minimumEpisodes: 2, minimumConfidence: "medium" },
  exploratory: { minimumCoverage: 0.6, minimumSessions: 2, minimumEpisodes: 1, minimumConfidence: "medium" },
};
const CONFIDENCE = { low: 1, medium: 2, high: 3 };
const SUPPORTED_SIGNALS = {
  planning: new Set(["explicit_plan_events", "plan_tool_indicators", "planning_language", "task_decomposition_unavailable"]),
  ai_steering: new Set(["correction_events", "correction_language", "correction_followups"]),
  execution_leverage: new Set(["ai_session_activity", "git_activity_only", "authorship_unavailable", "manual_authorship_unavailable", "ai_authorship_unavailable", "hybrid_authorship_unavailable", "explicit_orchestration", "explicit_background_lifecycle", "orchestration_unavailable"]),
  engineering_quality: new Set(["verification_attempt", "verification_result", "verification_unavailable", "failure_events", "later_success_signals"]),
  product_thinking: new Set(["product_language", "product_decisions_unavailable"]),
};
const hashRef = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function stableObservedOutcomeKey(projectId, outcome) {
  const activity = Array.isArray(outcome.activityRefs) ? outcome.activityRefs.filter(hashRef) : [];
  const results = Array.isArray(outcome.resultRefs) ? outcome.resultRefs.filter(hashRef) : [];
  const anchor = outcome.category === "git_commit" ? results[0]
    : outcome.category === "correction" || outcome.category === "plan_lifecycle" ? activity[0]
      : outcome.category === "tool_execution" ? [activity[0], results[0]].filter(Boolean).join(":")
        : null;
  return anchor ? `${projectId}:${outcome.category}:${anchor}` : null;
}

function sessionIndex(report) {
  const map = new Map();
  for (const session of report.agents?.sessions || []) {
    for (const ref of session.sequenceSummary?.evidenceRefs || []) if (hashRef(ref)) map.set(ref, session.sessionKey);
  }
  return map;
}

/**
 * Internal calibration only. Regular Chronicle observations are activity evidence, not
 * measured outcomes; they are intentionally excluded from the candidate score formula.
 * `calibrationOutcomes` is a simulator-only input used by clearly synthetic tests.
 */
export function simulateScoring(reports, { preset = "balanced" } = {}) {
  if (!Array.isArray(reports) || !reports.length || !PRESETS[preset]) throw new Error("scoring_simulator_input_invalid");
  const thresholds = PRESETS[preset];
  const reportsById = new Map();
  for (const report of reports) {
    if (!report || !/^[0-9a-f-]{36}$/i.test(report.reportId || "") || !report.project?.localProjectId || ![2, 3, 4, 5, 6, 7, 8].includes(report.schemaVersion)) throw new Error("scoring_simulator_report_invalid");
    reportsById.set(report.reportId, report);
  }
  const uniqueReports = [...reportsById.values()].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || a.reportId.localeCompare(b.reportId));
  const dimensions = DIMENSIONS.map((dimension) => {
    const seen = new Map();
    const observedOutcomes = new Map();
    const coverageBySource = new Map();
    const allRelevant = [];
    const exclusions = [];
    for (const report of uniqueReports) {
      const projectId = report.project.localProjectId;
      const refsToSession = sessionIndex(report);
      const outcomeCategories = { planning: ["plan_lifecycle"], ai_steering: ["correction"], execution_leverage: ["git_commit"], engineering_quality: ["tool_execution"], product_thinking: [] }[dimension];
      for (const outcome of report.engineeringOutcomes || []) if (outcomeCategories.includes(outcome.category) && typeof outcome.outcomeId === "string") {
        const identity = stableObservedOutcomeKey(projectId, outcome);
        if (!identity) continue;
        let group = observedOutcomes.get(identity);
        if (!group) { group = { latest: outcome, variants: new Map() }; observedOutcomes.set(identity, group); }
        group.variants.set(JSON.stringify(outcome), outcome);
        group.latest = outcome;
      }
      const relevant = [];
      for (const observation of report.behavioralAnalysis?.observations || []) {
        const belongs = dimension === "planning" ? observation.category === "planning"
          : dimension === "ai_steering" ? observation.category === "ai_steering"
            : dimension === "execution_leverage" ? ["execution_approach", "agent_orchestration"].includes(observation.category)
              : dimension === "engineering_quality" ? ["verification", "failure_recovery"].includes(observation.category)
                : observation.category === "product_thinking";
        if (!belongs) continue;
        relevant.push(observation);
        allRelevant.push(observation);
        const coverageRecord = observation.evidenceCoverage;
        const coverageKey = `${report.project.localProjectId}:${observation.signal}:${observation.sourceAdapter || "unknown"}`;
        const previousCoverage = coverageBySource.get(coverageKey) || { total: 0, included: 0 };
        coverageBySource.set(coverageKey, { total: Math.max(previousCoverage.total, Number(coverageRecord?.totalAvailable || 0)), included: Math.max(previousCoverage.included, Number(coverageRecord?.referencesIncluded || 0)) });
        const eligibleClass = ["confirmed", "probable"].includes(observation.evidenceClassification);
        if (!SUPPORTED_SIGNALS[dimension].has(observation.signal)) { exclusions.push({ observationId: observation.observationId, reason: "unsupported_observation_signal" }); continue; }
        if (!eligibleClass) { exclusions.push({ observationId: observation.observationId, reason: "heuristic_or_unavailable_classification" }); continue; }
        const refs = (observation.evidenceRefs || []).filter(hashRef);
        const coverage = observation.evidenceCoverage;
        if (!coverage || coverage.totalAvailable <= 0 || coverage.truncated || coverage.referencesIncluded !== refs.length) {
          exclusions.push({ observationId: observation.observationId, reason: "incomplete_or_truncated_evidence_coverage" });
          continue;
        }
        if (!observation.calibrationOutcomes) {
          exclusions.push({ observationId: observation.observationId, reason: "activity_observation_is_not_a_measured_outcome" });
          continue;
        }
        for (const outcome of observation.calibrationOutcomes) {
          if (!outcome || !["positive", "adverse"].includes(outcome.outcome) || !hashRef(outcome.evidenceRef) || !refs.includes(outcome.evidenceRef) || !hashRef(outcome.episodeRef) || !hashRef(outcome.sessionRef) || !["confirmed"].includes(outcome.evidenceClassification) || !(CONFIDENCE[outcome.confidence] >= CONFIDENCE[thresholds.minimumConfidence])) {
            exclusions.push({ observationId: observation.observationId, reason: "outcome_missing_direct_evidence_or_confidence" });
            continue;
          }
          const key = `${projectId}:${outcome.evidenceRef}`;
          const prior = seen.get(key);
          if (prior && prior.outcome !== outcome.outcome) { prior.conflict = true; exclusions.push({ observationId: observation.observationId, reason: "contradictory_duplicate_evidence" }); continue; }
          if (!prior) seen.set(key, { ...outcome, projectId, confidence: outcome.confidence, observationId: observation.observationId, session: refsToSession.get(outcome.sessionRef) || outcome.sessionRef });
        }
      }
      if (relevant.length && relevant.every((item) => item.evidenceClassification === "unavailable")) exclusions.push({ reportId: report.reportId, reason: "dimension_unavailable_or_source_not_approved" });
    }
    const outcomes = [...seen.values()].filter((item) => !item.conflict);
    const conflicts = [...seen.values()].filter((item) => item.conflict).length;
    const positive = outcomes.filter((item) => item.outcome === "positive").length;
    const adverse = outcomes.filter((item) => item.outcome === "adverse").length;
    const sessions = new Set(outcomes.map((item) => item.session));
    const episodes = new Set(outcomes.map((item) => `${item.projectId}:${item.episodeRef}`));
    const totalAvailable = [...coverageBySource.values()].reduce((n, item) => n + item.total, 0);
    const included = [...coverageBySource.values()].reduce((n, item) => n + item.included, 0);
    const coverage = totalAvailable ? Math.min(1, included / totalAvailable) : 0;
    const distinctOutcomeCoverage = outcomes.length ? 1 : 0;
    const reasons = [];
    if (coverage < thresholds.minimumCoverage) reasons.push("evidence_reference_coverage_below_threshold");
    if (sessions.size < thresholds.minimumSessions) reasons.push("too_few_independent_sessions");
    if (episodes.size < thresholds.minimumEpisodes) reasons.push("too_few_project_scoped_episodes");
    if (outcomes.length < thresholds.minimumSessions) reasons.push("too_few_direct_measured_outcomes");
    if (conflicts) reasons.push("contradictory_evidence_excluded");
    if (!positive && !adverse) reasons.push("no_direct_outcome_evidence_available");
    const ready = reasons.length === 0 && distinctOutcomeCoverage === 1;
    return {
      dimension,
      status: ready ? "simulation_candidate" : "insufficient_evidence",
      simulationOnlyScore: ready ? Math.round(100 * positive / (positive + adverse)) : null,
      formula: "100 × directly supported positive outcomes ÷ (positive + directly supported adverse outcomes); missing outcomes are excluded, never treated as adverse",
      evidence: { relevantObservations: allRelevant.length, eligibleOutcomes: outcomes.length, positiveOutcomes: positive, adverseOutcomes: adverse, excludedConflicts: conflicts, distinctSessions: sessions.size, distinctProjectEpisodes: episodes.size, referenceCoveragePercent: Math.round(coverage * 10000) / 100, confidence: outcomes.length ? outcomes.reduce((min, item) => Math.min(min, CONFIDENCE[item.confidence]), 3) === 3 ? "high" : "medium" : "insufficient" },
      observedOutcomeRecords: [...observedOutcomes.values()].reduce((rows, group) => { const item = group.latest; const key = `${item.category}:${item.state}`; rows[key] = (rows[key] || 0) + 1; return rows; }, {}),
      observedOutcomeConflicts: [...observedOutcomes.values()].filter((group) => {
        const variants = [...group.variants.values()];
        const definitiveToolStates = new Set(variants.filter((item) => item.category === "tool_execution" && ["passed", "failed"].includes(item.state)).map((item) => item.state));
        const classifications = new Set(variants.map((item) => item.evidenceClassification));
        return definitiveToolStates.size > 1 || classifications.size > 1;
      }).length,
      outcomeEvidenceLimit: observedOutcomes.size ? "These lifecycle records are visible to calibration, but are not adjudicated positive/adverse dimension outcomes. No candidate score is derived from them." : "No dimension-linked outcome records are available in the selected snapshots.",
      thresholdResult: { ...thresholds },
      reasons,
      exclusions: [...new Map(exclusions.map((item) => [`${item.observationId || item.reportId}:${item.reason}`, item])).values()],
    };
  });
  return { simulatorVersion: 1, label: "INTERNAL CALIBRATION SIMULATION — NOT A CHRONICLE DEVELOPER SCORE", preset, duplicateReportsIgnored: reports.length - uniqueReports.length, uniqueReportCount: uniqueReports.length, candidateFormula: "Evidence-weighted outcome balance; no activity volume or missing evidence penalty.", dimensions, deterministic: true, productionUse: false };
}

export function scoringThresholdPresets() { return structuredClone(PRESETS); }
export function scoringDimensionNames() { return [...DIMENSIONS]; }
