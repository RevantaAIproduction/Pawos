const LOCAL_LIMITATIONS = {
  aider: "Exact project-local Markdown file; requires exact-file approval and has no structured tool/model/outcome records.",
  "claude-code": "Project markers are configuration only; supported session history is outside the project and requires explicit external-source opt-in and per-project approval.",
  codex: "Project markers are configuration only; supported session history is outside the project and requires explicit external-source opt-in and per-project approval.",
  "gemini-cli": "Project markers are configuration only; supported session history is outside the project and requires explicit external-source opt-in and per-project approval.",
};
const EXTERNAL_LIMITATION = "External source contents are not inspected by default; exact-path and repository-specific approval are required before parsing.";

const sourceResultFor = (results, id) => results.find((item) => item.sourceId === id || item.adapterId === id);

/** Sanitized source inventory: no absolute paths, config contents, or transcript text. */
export function buildSourceCoverage({ report, projectDiscovery, externalOptions = [], externalInventory = [], externalOptIn = false, localApproval = {}, externalApproval = {}, sourceResults = [], failedSourceIds = [] }) {
  const detectedById = new Map((projectDiscovery?.detectedAgents || []).map((agent) => [agent.adapterId, {
    agentId: agent.adapterId,
    configurationDetected: Boolean(agent.configurationDetected),
    activityDetected: Boolean(agent.activitySourceDetected) || sourceResults.some((item) => item.adapterId === agent.adapterId && item.matched > 0),
    activityEvidenceObserved: sourceResults.some((item) => item.adapterId === agent.adapterId && item.matched > 0),
    usageEstablished: sourceResults.some((item) => item.adapterId === agent.adapterId && item.matched > 0),
    parserStatus: agent.behavioralAnalysis === "project_local_chat_history_supported" ? "project_local_supported" : agent.behavioralAnalysis === "external_session_adapter_only" ? "external_only" : "detection_only",
  }]));
  for (const result of sourceResults.filter((item) => item.matched > 0)) if (!detectedById.has(result.adapterId)) detectedById.set(result.adapterId, {
    agentId: result.adapterId, configurationDetected: false, activityDetected: true, activityEvidenceObserved: true,
    usageEstablished: true, parserStatus: "external_only",
  });
  const detectedAgents = [...detectedById.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));

  const projectLocalSources = [{
    sourceId: "git", sourceType: "repository_history", detectionStatus: "available", parserStatus: "supported",
    consentStatus: "not_required", inspectionStatus: "parsed", filesDiscovered: report.git.commitCount,
    filesRead: 0, sessionsMatched: 0, limitation: "Git commits and file-change metadata are activity evidence; they do not establish authorship.",
  }];
  for (const agent of projectDiscovery?.detectedAgents || []) {
    const id = agent.adapterId;
    const files = agent.activityFiles || [];
    if (!files.length) {
      projectLocalSources.push({
        sourceId: id, sourceType: "configuration", detectionStatus: "detected", parserStatus: agent.behavioralAnalysis === "external_session_adapter_only" ? "external_only" : "detection_only",
        consentStatus: "not_applicable", inspectionStatus: "configuration_only", filesDiscovered: agent.configurationMarkers?.length || 0,
        filesRead: 0, sessionsMatched: 0, limitation: LOCAL_LIMITATIONS[id] || "Configuration does not establish activity; no project-local parser is implemented.",
      });
      continue;
    }
    for (const file of files) {
      const isSupported = file.parserStatus === "project_local_supported";
      const approval = localApproval[file.path] === true;
      const result = sourceResultFor(sourceResults, id);
      const failed = failedSourceIds.includes(id);
      projectLocalSources.push({
        sourceId: id, sourceType: "agent_activity", detectionStatus: "detected",
        parserStatus: isSupported ? "supported" : "detection_only",
        consentStatus: !isSupported ? "not_applicable" : approval ? "approved" : "not_approved",
        inspectionStatus: !isSupported ? "unsupported" : !approval ? "not_approved" : failed ? "failed" : result ? "parsed" : "not_inspected",
        filesDiscovered: 1, filesRead: result?.filesRead || 0, sessionsMatched: result?.matched || 0,
        limitation: LOCAL_LIMITATIONS[id] || "The detected activity format has no project-local parser.",
      });
    }
  }
  for (const item of projectDiscovery?.unidentifiedActivitySources || []) projectLocalSources.push({
    sourceId: "unidentified", sourceType: "unidentified_activity", detectionStatus: "detected", parserStatus: "unsupported",
    consentStatus: "not_applicable", inspectionStatus: "unsupported", filesDiscovered: 1, filesRead: 0, sessionsMatched: 0,
    limitation: "A project-local activity-like file was detected, but Chronicle has no adapter for it.",
  });

  const inventory = externalOptIn ? externalInventory : externalOptions.map((item) => ({ ...item, status: "not_inspected", available: false, sessionFiles: 0, skippedOversize: 0 }));
  const externalSources = inventory.map((item) => {
    const result = sourceResults.find((row) => row.sourceId === item.sourceId);
    const approved = externalApproval[item.sourceId] === true;
    const failure = failedSourceIds.includes(item.sourceId);
    const discovered = externalOptIn ? Number(item.sessionFiles || 0) + Number(item.skippedOversize || 0) : null;
    let status = "not_inspected";
    if (externalOptIn) {
      if (!item.available) status = item.status === "not_present" ? "not_present" : "unavailable";
      else if (discovered === 0) status = "no_activity_records";
      else if (!approved) status = "not_approved";
      else if (failure) status = "failed";
      else if (result) status = "parsed";
      else status = "approved_not_parsed";
    }
    return {
      sourceId: item.sourceId, adapterId: item.adapterId, status,
      approvalStatus: !externalOptIn ? "not_requested" : approved ? "approved" : item.available && discovered > 0 ? "not_approved" : "not_required",
      discoveredFiles: discovered, filesRead: result?.filesRead || 0, sessionsMatched: result?.matched || 0,
      limitation: EXTERNAL_LIMITATION,
    };
  });
  return { schemaVersion: 1, detectedAgents, projectLocalSources, externalSources };
}
