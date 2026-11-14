import { createHash } from "node:crypto";

export type ChronicleObservation = {
  observationId?: string; category?: string; signal?: string; description?: string;
  evidenceRefs?: unknown[]; evidenceClassification?: string; confidence?: string;
  limitations?: string; evidenceCoverage?: { totalAvailable?: number; referencesIncluded?: number; omitted?: number; truncated?: boolean; coveragePercent?: number; unavailableReason?: string };
};
export type ChronicleEngineeringOutcome = {
  outcomeId: string; category: string; state: string; activityRefs?: unknown[]; resultRefs?: unknown[];
  confidence?: string; evidenceClassification?: string; relationshipType?: string; limitations?: string;
};
export type ChronicleAgentSession = { sessionKey?: string; sequenceSummary?: { evidenceRefs?: unknown[] } };
export type ChronicleSource = {
  sourceId: string; status?: string; inspectionStatus?: string; consentStatus?: string; approvalStatus?: string;
  parserStatus?: string; limitation?: string; sessionsMatched?: number; filesRead?: number; matchedSessions?: number; skippedFiles?: number;
};
export type ChronicleDetectedAgent = { agentId: string; configurationDetected?: boolean; activityDetected?: boolean; parserStatus?: string; activityEvidenceObserved?: boolean };
type ChronicleSourceInventory = { detectedAgents?: ChronicleDetectedAgent[]; projectLocalSources?: ChronicleSource[]; externalSources?: ChronicleSource[] };
export type ChronicleProfileSnapshot = {
  id: string; project_id: string; project_name: string; snapshot_hash: string; created_at: string;
  report_data: { schemaVersion?: number; createdAt?: string; project?: { localProjectId?: string }; git?: { commitIds?: string[]; commitCount?: number; fileChanges?: number }; behavioralAnalysis?: { observations?: ChronicleObservation[] }; engineeringOutcomes?: ChronicleEngineeringOutcome[]; agents?: { sessions?: ChronicleAgentSession[]; metrics?: Record<string,unknown>; sourceCoverage?: ChronicleSource[] }; episodes?: Array<{episodeId?: string}>; sourceInventory?: ChronicleSourceInventory; sourceAvailability?: Record<string,string> };
};
type Snapshot = ChronicleProfileSnapshot;
type ObservationEntry = { report: Snapshot; item: ChronicleObservation };
type ObservationGroup = { category: string; signal: string; entries: ObservationEntry[]; evidenceKeys: Set<string>; snapshotKeys: Set<string>; firstObservedAt: string | null; lastObservedAt: string | null };
type OutcomeGroup = { identity: string; variants: Map<string, ChronicleEngineeringOutcome>; outcomeIds: Set<string>; firstObservedAt: string | null; lastObservedAt: string | null; snapshots: Set<string> };
type Evidence = { firstObservedAt: string; lastObservedAt: string; sessionIds: Set<string>; classifications: Set<string>; confidence: Set<string> };
type ProjectGroup = { id: string; names: Set<string>; reports: Snapshot[]; uniqueSnapshots: Map<string, Snapshot>; evidence: Map<string,Evidence>; observations: Map<string, ObservationGroup>; outcomes: Map<string, OutcomeGroup>; episodes: Set<string> };
type CoverageHistoryEntry = { reportId: string; observedAt: string | null; snapshotHash: string; totalAvailable: number; referencesIncluded: number; omitted: number; truncated: boolean; unavailableReason: string };
type ChronicleQueryResult = { data: unknown[] | null; error: unknown };
type ChronicleQuery = { eq: (field: string, value: string) => ChronicleQuery; order: (field: string, options?: { ascending: boolean }) => ChronicleQuery; range: (start: number, end: number) => PromiseLike<ChronicleQueryResult> };
export type ChronicleProfileDatabase = { from: (table: string) => { select: (columns: string) => ChronicleQuery } };
const areas = [
  ["planning", "Planning"], ["technical_decision", "Technical decisions"], ["ai_steering", "AI steering"],
  ["execution_approach", "Execution approach"], ["agent_orchestration", "Agent orchestration"],
  ["verification", "Verification"], ["failure_recovery", "Failure and recovery"], ["product_thinking", "Product thinking"],
] as const;
const validRef = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function outcomeIdentityKey(item: ChronicleEngineeringOutcome, projectId: string): string | null {
  const activity = Array.isArray(item.activityRefs) ? item.activityRefs.filter(validRef) : [];
  const results = Array.isArray(item.resultRefs) ? item.resultRefs.filter(validRef) : [];
  const category = typeof item.category === "string" ? item.category : "";
  // IDs on individual snapshots encode the current state/relationship. These keys use
  // the stable primary evidence so an outcome gaining later evidence is not counted twice.
  const anchor = category === "git_commit" ? results[0]
    : category === "correction" || category === "plan_lifecycle" ? activity[0]
      : category === "tool_execution" ? [activity[0], results[0]].filter(Boolean).join(":")
        : null;
  return anchor ? `${projectId}:${category}:${anchor}` : null;
}
function stableProfileOutcomeId(identity: string): string {
  // The database report IDs remain untouched; this is only a deterministic profile key.
  return createHash("sha256").update(`chronicle-profile-outcome-v1\0${identity}`).digest("hex");
}
function outcomeHasConflictingResult(variants: Map<string, ChronicleEngineeringOutcome>): boolean {
  const definitiveToolStates = new Set([...variants.values()].filter((item) => item.category === "tool_execution" && ["passed", "failed"].includes(item.state)).map((item) => item.state));
  return definitiveToolStates.size > 1;
}
const timestamp = (value: string) => Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString();
const snapshotOrder = (a: Snapshot, b: Snapshot) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** Pure, deterministic account-profile projection over immutable report rows. It never persists profile copies. */
export function aggregateChronicleProfile(input: Snapshot[]) {
  const reports = [...input].filter((row) => row && /^[a-f0-9-]{36}$/i.test(row.id) && /^[a-f0-9]{64}$/.test(row.project_id) && /^[a-f0-9]{64}$/.test(row.snapshot_hash) && row.report_data && typeof row.report_data === "object" && (!row.report_data.project?.localProjectId || row.report_data.project.localProjectId === row.project_id)).sort(snapshotOrder);
  const projectGroups = new Map<string, ProjectGroup>();
  let repeatedSnapshotUploads = 0;
  for (const report of reports) {
    let project = projectGroups.get(report.project_id);
    if (!project) { project = { id: report.project_id, names: new Set(), reports: [], uniqueSnapshots: new Map(), evidence: new Map(), observations: new Map(), outcomes: new Map(), episodes: new Set() }; projectGroups.set(report.project_id, project); }
    project.reports.push(report);
    if (typeof report.project_name === "string") project.names.add(report.project_name.slice(0,120));
    const logicalSnapshotKey = report.project_id + ":" + report.snapshot_hash;
    if (project.uniqueSnapshots.has(logicalSnapshotKey)) repeatedSnapshotUploads++;
    else project.uniqueSnapshots.set(logicalSnapshotKey, report);

    const observedAt = timestamp(report.created_at) || timestamp(String(report.report_data.createdAt || ""));
    const sessionForRef = new Map<string,string>();
    for (const session of report.report_data.agents?.sessions || []) {
      for (const ref of session.sequenceSummary?.evidenceRefs || []) if (validRef(ref) && typeof session.sessionKey === "string") sessionForRef.set(ref, report.project_id + ":" + session.sessionKey);
    }
    for (const episode of report.report_data.episodes || []) if (typeof episode.episodeId === "string") project.episodes.add(report.project_id + ":" + episode.episodeId);
    for (const item of report.report_data.engineeringOutcomes || []) {
      if (typeof item?.outcomeId !== "string" || !validRef(item.outcomeId) || typeof item.category !== "string" || typeof item.state !== "string") continue;
      const identity = outcomeIdentityKey(item, report.project_id);
      if (!identity) continue;
      let group = project.outcomes.get(identity);
      if (!group) { group = { identity, variants:new Map<string,ChronicleEngineeringOutcome>(), outcomeIds:new Set<string>(), firstObservedAt:observedAt, lastObservedAt:observedAt, snapshots:new Set<string>() }; project.outcomes.set(identity,group); }
      const variant = JSON.stringify(item);
      group.variants.set(variant,item);
      group.outcomeIds.add(item.outcomeId);
      group.snapshots.add(logicalSnapshotKey);
      if (observedAt && (!group.firstObservedAt || observedAt < group.firstObservedAt)) group.firstObservedAt = observedAt;
      if (observedAt && (!group.lastObservedAt || observedAt > group.lastObservedAt)) group.lastObservedAt = observedAt;
    }
    const observations = report.report_data.behavioralAnalysis?.observations || [];
    for (const item of observations) {
      if (!item || typeof item.category !== "string" || typeof item.signal !== "string") continue;
      const groupKey = item.category + "\0" + item.signal;
      let group = project.observations.get(groupKey);
      if (!group) { group = { category:item.category, signal:item.signal, entries:[], evidenceKeys:new Set<string>(), snapshotKeys:new Set<string>(), firstObservedAt:null, lastObservedAt:null }; project.observations.set(groupKey, group); }
      group.entries.push({ report, item });
      group.snapshotKeys.add(logicalSnapshotKey);
      if (observedAt && (!group.firstObservedAt || observedAt < group.firstObservedAt)) group.firstObservedAt = observedAt;
      if (observedAt && (!group.lastObservedAt || observedAt > group.lastObservedAt)) group.lastObservedAt = observedAt;
      const refs = [...new Set((item.evidenceRefs || []).filter(validRef))];
      for (const ref of refs) {
        const key = report.project_id + ":" + ref;
        group.evidenceKeys.add(key);
        let evidence = project.evidence.get(key);
        if (!evidence) { evidence = { firstObservedAt: observedAt || "", lastObservedAt: observedAt || "", sessionIds:new Set(), classifications:new Set(), confidence:new Set() }; project.evidence.set(key,evidence); }
        if (observedAt && (!evidence.firstObservedAt || observedAt < evidence.firstObservedAt)) evidence.firstObservedAt = observedAt;
        if (observedAt && observedAt > evidence.lastObservedAt) evidence.lastObservedAt = observedAt;
        if (sessionForRef.has(ref)) evidence.sessionIds.add(sessionForRef.get(ref)!);
        if (typeof item.evidenceClassification === "string") evidence.classifications.add(item.evidenceClassification);
        if (typeof item.confidence === "string") evidence.confidence.add(item.confidence);
      }
    }
  }

  const projects = [...projectGroups.values()].map((project) => {
    const orderedReports = [...project.reports].sort(snapshotOrder);
    const latest = orderedReports.at(-1)!;
    const firstSeen = orderedReports.map((row) => timestamp(row.created_at)).filter((x): x is string => Boolean(x)).sort()[0] || null;
    const lastSeen = orderedReports.map((row) => timestamp(row.created_at)).filter((x): x is string => Boolean(x)).sort().at(-1) || null;
    const observationGroups = [...project.observations.values()].map((group) => {
      const classifications = [...new Set(group.entries.map(({item}) => item.evidenceClassification).filter((value): value is string => Boolean(value)))].sort();
      const confidenceLevels = [...new Set(group.entries.map(({item}) => item.confidence).filter((value): value is string => Boolean(value)))].sort();
      const latestEntry = [...group.entries].sort((a,b)=>snapshotOrder(a.report,b.report)).at(-1);
      const latestCoverage = latestEntry?.item.evidenceCoverage || null;
      const evidence = [...group.evidenceKeys].map((key) => project.evidence.get(key)!);
      const reportsBySnapshot = new Map<string,Snapshot>();
      for (const entry of [...group.entries].sort((a,b)=>snapshotOrder(a.report,b.report))) reportsBySnapshot.set(entry.report.snapshot_hash,entry.report);
      const sourceReports = [...reportsBySnapshot.values()].map((row)=>({reportId:row.id,observedAt:timestamp(row.created_at)}));
      const distinctSessions = new Set(evidence.flatMap((item) => [...item.sessionIds])).size;
      const evidenceCount = group.evidenceKeys.size;
      const unavailable = evidenceCount === 0 && classifications.includes("unavailable");
      const isGitActivity = group.signal === "git_activity_only";
      const recurring = !unavailable && (isGitActivity ? evidenceCount > 1 : distinctSessions > 1);
      const conflicted = evidence.some((item) => item.classifications.size > 1 || item.confidence.size > 1) || classifications.length > 1 || confidenceLevels.length > 1;
      const coverageHistory: CoverageHistoryEntry[] = [...group.entries].sort((a,b)=>snapshotOrder(a.report,b.report)).flatMap((entry) => {
        const coverage = entry.item.evidenceCoverage;
        return coverage ? [{
          reportId: entry.report.id, observedAt: timestamp(entry.report.created_at), snapshotHash: entry.report.snapshot_hash,
          totalAvailable: Number(coverage.totalAvailable || 0), referencesIncluded: Number(coverage.referencesIncluded || 0),
          omitted: Number(coverage.omitted || 0), truncated: Boolean(coverage.truncated),
          unavailableReason: coverage.unavailableReason || "not_applicable",
        }] : [];
      });
      const trend = new Map<string, CoverageHistoryEntry>();
      for (const row of coverageHistory) if (!trend.has(row.snapshotHash)) trend.set(row.snapshotHash, row);
      return {
        category:group.category, signal:group.signal,
        description: typeof latestEntry?.item.description === "string" ? latestEntry.item.description : "Observation details are unavailable in this report version.",
        limitations: [...new Set([...group.entries.map(({item}) => item.limitations).filter((value): value is string => typeof value === "string"), ...(group.category === "agent_orchestration" && group.signal === "explicit_background_lifecycle" ? ["Observed background lifecycle records identify tool or agent activity, not whether the developer initiated or coordinated delegation."] : []), ...(latestCoverage?.truncated ? ["Distinct session count is a lower bound from included references; truncated references may omit additional sessions."] : [])])],
        classification: classifications.length === 1 ? classifications[0] : classifications.length ? "varies_by_snapshot" : "unavailable",
        classifications, confidence: confidenceLevels.length === 1 ? confidenceLevels[0] : confidenceLevels.length ? "varies_by_snapshot" : "insufficient",
        confidenceLevels, conflictingEvidence:conflicted, uniqueEvidenceCount:evidenceCount, distinctSessions,
        uniqueSnapshots:group.snapshotKeys.size, firstObservedAt:group.firstObservedAt, lastObservedAt:group.lastObservedAt,
        recurrence: unavailable ? "not_assessed" : recurring ? "recurring_evidence" : "one_time_or_single_session",
        coverage:{ uniqueReferencesIncluded:evidenceCount, latest:latestCoverage ? { totalAvailable:Number(latestCoverage.totalAvailable||0), referencesIncluded:Number(latestCoverage.referencesIncluded||0), omitted:Number(latestCoverage.omitted||0), truncated:Boolean(latestCoverage.truncated), unavailableReason:latestCoverage.unavailableReason||"not_applicable" } : null, history:[...trend.values()] },
        observationIds:[...new Set(group.entries.map(({item})=>item.observationId).filter((value): value is string => Boolean(value)))].sort(),
        sourceReports:sourceReports.slice(-12), sourceReportCount:sourceReports.length,
      };
    }).sort((a,b)=>a.category.localeCompare(b.category)||a.signal.localeCompare(b.signal));
    const outcomeGroups = [...project.outcomes.values()].map((group) => {
      const variants = [...group.variants.values()];
      const latestVariant = variants.at(-1)!;
      const states = [...new Set(variants.map((item)=>item.state))].sort();
      return { outcomeId:stableProfileOutcomeId(group.identity), sourceOutcomeIds:[...group.outcomeIds].sort(), category:latestVariant.category, states, conflictingEvidence:outcomeHasConflictingResult(group.variants),
        confidenceLevels:[...new Set(variants.map((item)=>item.confidence).filter((value): value is string => Boolean(value)))].sort(), classifications:[...new Set(variants.map((item)=>item.evidenceClassification).filter((value): value is string => Boolean(value)))].sort(),
        relationshipTypes:[...new Set(variants.map((item)=>item.relationshipType).filter((value): value is string => Boolean(value)))].sort(), activityRefs:[...new Set(variants.flatMap((item)=>Array.isArray(item.activityRefs)?item.activityRefs:[]).filter(validRef))].sort().slice(0,32),
        resultRefs:[...new Set(variants.flatMap((item)=>Array.isArray(item.resultRefs)?item.resultRefs:[]).filter(validRef))].sort().slice(0,32),
        limitations:[...new Set(variants.map((item)=>item.limitations).filter((value): value is string => typeof value==="string"))].slice(0,6), uniqueSnapshots:group.snapshots.size, firstObservedAt:group.firstObservedAt,lastObservedAt:group.lastObservedAt };
    }).sort((a,b)=>a.category.localeCompare(b.category)||a.outcomeId.localeCompare(b.outcomeId));
    const coverageReport = [...orderedReports].reverse().find((row) => row.report_data.sourceInventory || row.report_data.agents?.sourceCoverage?.length || row.report_data.sourceAvailability) || latest;
    const sourceInventory = coverageReport.report_data.sourceInventory || null;
    const sourceAvailability = coverageReport.report_data.sourceAvailability || {};
    return {
      projectId:project.id, projectName:latest.project_name || "Project",
      uploadedReportCount:project.reports.length, uniqueSnapshotCount:project.uniqueSnapshots.size, episodeCount:project.episodes.size,
      firstObservedAt:firstSeen,lastObservedAt:lastSeen,
      sourceCoverage:sourceInventory ? { observedAt:timestamp(coverageReport.created_at), detectedAgents:sourceInventory.detectedAgents||[], projectLocalSources:sourceInventory.projectLocalSources||[], externalSources:sourceInventory.externalSources||[] } : { observedAt:timestamp(coverageReport.created_at), legacyAvailability:sourceAvailability, legacySourceCoverage:coverageReport.report_data.agents?.sourceCoverage||[], limitation:"This snapshot predates detailed source inventory; missing activity cannot be interpreted as no AI use." },
      outcomes:{uniqueCount:outcomeGroups.length,items:outcomeGroups.slice(-100)},
      areas:areas.map(([key,title])=>({key,title,status:observationGroups.some((item)=>item.category===key && item.classification!=="unavailable" && (key!=="agent_orchestration"||item.signal==="developer_directed_orchestration")) ? "observed" : "not_assessed",observations:observationGroups.filter((item)=>item.category===key)})),
    };
  }).sort((a,b)=>a.projectId.localeCompare(b.projectId));
  const allObservations = projects.flatMap((project)=>project.areas.flatMap((area)=>area.observations));
  return {
    schemaVersion:1, reportCount:reports.length, uniqueSnapshotCount:projects.reduce((sum,item)=>sum+item.uniqueSnapshotCount,0),
    repeatedSnapshotUploads, projectCount:projects.length,
    firstObservedAt:projects.map((item)=>item.firstObservedAt).filter(Boolean).sort()[0]||null,
    lastObservedAt:projects.map((item)=>item.lastObservedAt).filter(Boolean).sort().at(-1)||null,
    uniqueEvidenceCount:[...projectGroups.values()].reduce((sum,project)=>sum+project.evidence.size,0),
    conflictCount:allObservations.filter((item)=>item.conflictingEvidence).length+[...projectGroups.values()].reduce((sum,project)=>sum+[...project.outcomes.values()].filter((item)=>outcomeHasConflictingResult(item.variants)).length,0),
    limitations:[
      "Profiles are rebuilt from private immutable report snapshots owned by the signed-in PawOS account; no separate profile account or stored aggregate is created.",
      "Evidence identities are deduplicated within each project only. Identical-looking evidence in distinct projects remains separate.",
      "Engineering episodes remain attached to their project and are never joined across projects.",
      "Repeated uploads may update last-observed dates, but identical evidence references do not increase evidence counts or establish recurrence.",
      "First and last observed dates refer to PawOS snapshot upload times, not necessarily the time when the underlying development work occurred.",
      "Outcome identities are deduplicated within each project; differing versions of one outcome are shown as conflicting and are not treated as new work.",
      "Historical profile data is an evidence summary, not a quality score. Legacy reports without detailed observations remain incomplete.",
    ], projects,
  };
}

/** Loads only the signed-in owner's snapshots with stable, bounded pagination. */
export async function loadChronicleProfileSnapshots(supabase: ChronicleProfileDatabase, ownerId: string, pageSize = 50, maxRows = 5000) {
  const snapshots: Snapshot[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data: resultData, error } = await supabase.from("chronicle_reports")
      .select("id,project_id,project_name,snapshot_hash,created_at,report_data")
      .eq("user_id", ownerId).order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, Math.min(offset + pageSize, maxRows) - 1);
    const data = resultData as unknown as Snapshot[] | null;
    if (error || !data) return { snapshots, error: true, truncated: false };
    snapshots.push(...data);
    if (data.length < pageSize) return { snapshots, error: false, truncated: false };
    if (offset + pageSize >= maxRows) {
      const overflow = await supabase.from("chronicle_reports").select("id").eq("user_id", ownerId)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(maxRows, maxRows);
      if (overflow.error) return { snapshots, error: true, truncated: false };
      return { snapshots, error: false, truncated: Boolean(overflow.data?.length) };
    }
  }
  return { snapshots, error: false, truncated: false };
}
