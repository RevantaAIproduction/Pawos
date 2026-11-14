import { describe, expect, it } from "vitest";
import { aggregateChronicleProfile, loadChronicleProfileSnapshots, type ChronicleAgentSession, type ChronicleEngineeringOutcome, type ChronicleObservation, type ChronicleProfileSnapshot } from "./historicalProfile";

const projectA = "a".repeat(64), projectB = "b".repeat(64), refA = "1".repeat(64), refB = "2".repeat(64), refC = "3".repeat(64);
function snapshot({ id, projectId = projectA, hash, at, version = 7, observations = [], sessions = [], episodes = [], engineeringOutcomes = [] }: { id: string; projectId?: string; hash: string; at: string; version?: number; observations?: ChronicleObservation[]; sessions?: ChronicleAgentSession[]; episodes?: Array<{ episodeId?: string }>; engineeringOutcomes?: ChronicleEngineeringOutcome[] }): ChronicleProfileSnapshot {
  return { id, project_id: projectId, project_name: projectId === projectA ? "PawOS" : "Other project", snapshot_hash: hash, created_at: at, report_data: { schemaVersion: version, project:{localProjectId:projectId}, behavioralAnalysis: version >= 5 ? { observations } : undefined, engineeringOutcomes, agents: { sessions }, episodes, sourceInventory: version >= 7 ? { detectedAgents: [], projectLocalSources: [], externalSources: [] } : undefined } };
}
function observation(refs: string[], overrides: Partial<ChronicleObservation> = {}): ChronicleObservation {
  return { observationId: "observation-1", category: "ai_steering", signal: "correction_followups", description: "A correction was followed by a later recorded agent action.", evidenceRefs: refs, evidenceClassification: "confirmed", confidence: "medium", evidenceCoverage: { totalAvailable: refs.length, referencesIncluded: refs.length, omitted: 0, truncated: false, coveragePercent: 100, unavailableReason: "not_applicable" }, limitations: "Sequence alone does not prove resolution.", ...overrides };
}
const session = (key: string, refs: string[]) => ({ sessionKey: key, sequenceSummary: { evidenceRefs: refs } });

describe("historical Chronicle profile aggregation", () => {
  it("deduplicates repeated uploads and evidence, preserves project scope and produces stable output", () => {
    const first = snapshot({ id:"11111111-1111-4111-8111-111111111111", hash:"a".repeat(64), at:"2026-01-01T00:00:00Z", observations:[observation([refA,refB]), observation([refC], { category:"planning", signal:"planning_language", evidenceClassification:"heuristic", confidence:"low" })], sessions:[session("s1",[refA]),session("s2",[refB]),session("s3",[refC])], episodes:[{episodeId:"episode-a"}] });
    const second = snapshot({ id:"22222222-2222-4222-8222-222222222222", hash:"b".repeat(64), at:"2026-02-01T00:00:00Z", observations:[observation([refA,refB,refC], { description:"The correction sequence was recorded in a later snapshot.", evidenceClassification:"probable", confidence:"low", evidenceCoverage:{totalAvailable:4,referencesIncluded:3,omitted:1,truncated:true,coveragePercent:75,unavailableReason:"not_applicable"} })], sessions:[session("s1",[refA]),session("s2",[refB]),session("s3",[refC])], episodes:[{episodeId:"episode-a"},{episodeId:"episode-b"}] });
    const duplicate = { ...second, id:"33333333-3333-4333-8333-333333333333", created_at:"2026-03-01T00:00:00Z" };
    const otherProject = snapshot({ id:"44444444-4444-4444-8444-444444444444", projectId:projectB, hash:"c".repeat(64), at:"2026-01-05T00:00:00Z", observations:[observation([refA])], sessions:[session("s1",[refA])] });
    const mismatchedProjectRow = { ...otherProject, id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd", snapshot_hash:"d".repeat(64), report_data:first.report_data };
    const rows = [first,second,duplicate,otherProject,mismatchedProjectRow];
    const profile = aggregateChronicleProfile(rows);
    const pawos = profile.projects.find((item)=>item.projectId===projectA)!;
    const group = pawos.areas.flatMap((area)=>area.observations).find((item)=>item.signal==="correction_followups")!;
    expect(profile.reportCount).toBe(4);
    expect(profile.uniqueSnapshotCount).toBe(3);
    expect(profile.repeatedSnapshotUploads).toBe(1);
    expect(profile.projectCount).toBe(2);
    expect(profile.uniqueEvidenceCount).toBe(4, "shared opaque reference across projects stays project-namespaced");
    expect(pawos.episodeCount).toBe(2);
    expect(group.uniqueEvidenceCount).toBe(3);
    expect(group.distinctSessions).toBe(3);
    expect(group.recurrence).toBe("recurring_evidence");
    expect(group.conflictingEvidence).toBe(true);
    expect(group.classifications).toEqual(["confirmed", "probable"]);
    expect(group.coverage.latest).toMatchObject({ totalAvailable:4, referencesIncluded:3, omitted:1, truncated:true });
    expect(group.firstObservedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(group.lastObservedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(JSON.stringify(profile)).not.toContain("projectRoot");
    expect(JSON.stringify(profile)).not.toContain(refA);
    expect(JSON.stringify(profile)).toBe(JSON.stringify(aggregateChronicleProfile([...rows].reverse())));
  });

  it("preserves unavailable and legacy reports without inventing observations", () => {
    const older = snapshot({ id:"55555555-5555-4555-8555-555555555555", hash:"d".repeat(64), at:"2025-01-01T00:00:00Z", version:2 });
    const unavailable = observation([], { signal:"technical_decisions_unavailable", category:"technical_decision", description:"Technical decisions are unavailable.", evidenceClassification:"unavailable", confidence:"low", evidenceCoverage:{totalAvailable:0,referencesIncluded:0,omitted:0,truncated:false,coveragePercent:0,unavailableReason:"source_unavailable"} });
    const latest = snapshot({ id:"66666666-6666-4666-8666-666666666666", hash:"e".repeat(64), at:"2026-01-01T00:00:00Z", observations:[unavailable] });
    const profile = aggregateChronicleProfile([older,latest]);
    const decisions = profile.projects[0].areas.find((area)=>area.key==="technical_decision")!;
    expect(decisions.status).toBe("not_assessed");
    expect(decisions.observations[0].recurrence).toBe("not_assessed");
    expect(decisions.observations[0].uniqueEvidenceCount).toBe(0);
    const legacyOnly = aggregateChronicleProfile([older]);
    expect(legacyOnly.projects[0].sourceCoverage.legacyAvailability).toBeTruthy();
    expect(legacyOnly.projects[0].sourceCoverage.limitation).toMatch(/predates detailed source inventory/);
  });

  it("rebuilds after a report is removed without retaining its evidence", () => {
    const two = snapshot({ id:"88888888-8888-4888-8888-888888888888", hash:"0".repeat(64), at:"2026-02-01T00:00:00Z", observations:[observation([refB])] });
    const rebuilt = aggregateChronicleProfile([two]);
    expect(rebuilt.reportCount).toBe(1);
    expect(rebuilt.uniqueEvidenceCount).toBe(1);
    expect(rebuilt.projects[0].areas.flatMap((area)=>area.observations).flatMap((item)=>item.observationIds)).not.toContain("removed-only");
  });

  it("deduplicates historical outcomes per project and retains history without counting repeated uploads twice", () => {
    const outcome = { outcomeId:refA, category:"git_commit", state:"committed", activityRefs:[], resultRefs:[refB], provenance:[{sourceAdapter:"git",recordType:"git_commit_metadata"}], confidence:"high", evidenceClassification:"confirmed", relationshipType:"unlinked", limitations:"No authorship or session relationship is known." };
    const first = snapshot({ id:"12121212-1212-4121-8121-121212121212", hash:"1".repeat(64), at:"2026-01-01T00:00:00Z", version:8, engineeringOutcomes:[outcome] });
    const second = snapshot({ id:"13131313-1313-4131-8131-131313131313", hash:"2".repeat(64), at:"2026-02-01T00:00:00Z", version:8, engineeringOutcomes:[outcome] });
    const repeated = { ...second, id:"14141414-1414-4141-8141-141414141414", created_at:"2026-03-01T00:00:00Z" };
    const otherProject = snapshot({ id:"15151515-1515-4151-8151-151515151515", projectId:projectB, hash:"3".repeat(64), at:"2026-01-02T00:00:00Z", version:8, engineeringOutcomes:[outcome] });
    const profile = aggregateChronicleProfile([first,second,repeated,otherProject]);
    const pawos = profile.projects.find((item)=>item.projectId===projectA)!;
    expect(pawos.outcomes.uniqueCount).toBe(1);
    expect(pawos.outcomes.items[0].uniqueSnapshots).toBe(2);
    expect(pawos.outcomes.items[0].firstObservedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(pawos.outcomes.items[0].lastObservedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(profile.projects.find((item)=>item.projectId===projectB)!.outcomes.uniqueCount).toBe(1);
  });

  it("deduplicates outcomes whose state or relationship evolves as new evidence is observed", () => {
    const correctionBefore = { outcomeId:refA, category:"correction", state:"unresolved", activityRefs:[refB], resultRefs:[], provenance:[{sourceAdapter:"codex",recordType:"response_item.message"}], confidence:"high", evidenceClassification:"confirmed", relationshipType:"direct_reference", limitations:"No later event retained." };
    const correctionAfter = { ...correctionBefore, outcomeId:refC, state:"response_observed", resultRefs:["4".repeat(64)], confidence:"medium", evidenceClassification:"probable", relationshipType:"inferred_association", limitations:"A later event was observed; relevance is unknown." };
    const commitBefore = { outcomeId:"5".repeat(64), category:"git_commit", state:"committed", activityRefs:[], resultRefs:["6".repeat(64)], provenance:[{sourceAdapter:"git",recordType:"git_commit_metadata"}], confidence:"high", evidenceClassification:"confirmed", relationshipType:"unlinked", limitations:"No session relationship is known." };
    const commitAfter = { ...commitBefore, outcomeId:"7".repeat(64), activityRefs:["8".repeat(64)], confidence:"medium", evidenceClassification:"probable", relationshipType:"inferred_association", limitations:"An inferred session association was observed." };
    const first = snapshot({ id:"16161616-1616-4161-8161-161616161616", hash:"4".repeat(64), at:"2026-01-01T00:00:00Z", version:8, engineeringOutcomes:[correctionBefore,commitBefore] });
    const later = snapshot({ id:"17171717-1717-4171-8171-171717171717", hash:"5".repeat(64), at:"2026-02-01T00:00:00Z", version:8, engineeringOutcomes:[correctionAfter,commitAfter] });
    const profile = aggregateChronicleProfile([first,later]);
    const outcomes = profile.projects[0].outcomes;
    expect(outcomes.uniqueCount).toBe(2);
    const correction = outcomes.items.find((item)=>item.category==="correction");
    expect(correction.states).toEqual(["response_observed","unresolved"]);
    expect(correction.sourceOutcomeIds).toHaveLength(2);
    expect(correction.conflictingEvidence).toBe(false);
    const commit = outcomes.items.find((item)=>item.category==="git_commit");
    expect(commit.uniqueSnapshots).toBe(2);
    expect(commit.relationshipTypes).toEqual(["inferred_association","unlinked"]);
  });

  it("keeps contradictory definitive results visible after stable-evidence deduplication", () => {
    const passed = { outcomeId:refA, category:"tool_execution", state:"passed", activityRefs:[refB], resultRefs:[refC], provenance:[{sourceAdapter:"codex",recordType:"response_item.local_shell_call"}], confidence:"high", evidenceClassification:"confirmed", relationshipType:"direct_reference", limitations:"Operation result observed." };
    const failed = { ...passed, outcomeId:"9".repeat(64), state:"failed", evidenceClassification:"probable" };
    const first = snapshot({ id:"18181818-1818-4181-8181-181818181818", hash:"6".repeat(64), at:"2026-01-01T00:00:00Z", version:8, engineeringOutcomes:[passed] });
    const second = snapshot({ id:"19191919-1919-4191-8191-191919191919", hash:"7".repeat(64), at:"2026-02-01T00:00:00Z", version:8, engineeringOutcomes:[failed] });
    const outcome = aggregateChronicleProfile([first,second]).projects[0].outcomes.items[0];
    expect(outcome.uniqueSnapshots).toBe(2);
    expect(outcome.states).toEqual(["failed","passed"]);
    expect(outcome.conflictingEvidence).toBe(true);
  });

  it("accepts schema versions 2 through 8, with old reports remaining incomplete", () => {
    for (let version = 2; version <= 8; version++) {
      const row = snapshot({ id:`99999999-9999-4999-8999-${String(version).padStart(12,"0")}`, hash:String(version).repeat(64), at:`2026-01-0${version}T00:00:00Z`, version, observations: version >= 6 ? [observation([refA])] : [] });
      expect(aggregateChronicleProfile([row]).reportCount).toBe(1);
    }
  });

  it("loads snapshots only for the signed-in PawOS account and paginates deterministically", async () => {
    const ownerRows = [
      snapshot({ id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hash:"1".repeat(64), at:"2026-01-01T00:00:00Z" }),
      snapshot({ id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", hash:"2".repeat(64), at:"2026-01-02T00:00:00Z" }),
      snapshot({ id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc", hash:"3".repeat(64), at:"2026-01-03T00:00:00Z" }),
    ];
    const calls: Array<[string,string]> = [];
    const supabase = { from: (table:string) => {
      expect(table).toBe("chronicle_reports");
      let owner = "", start = 0, end = 0;
      const query = {
        select: () => query,
        eq: (field:string,value:string) => { expect(field).toBe("user_id"); owner=value; return query; },
        order: () => query,
        range: async (first:number,last:number) => { start=first; end=last; calls.push([owner,`${start}-${end}`]); const rows=owner==="pawos-user-1"?ownerRows:[]; return {data:rows.slice(start,end+1),error:null}; },
      };
      return query;
    }};
    const result = await loadChronicleProfileSnapshots(supabase,"pawos-user-1",2,10);
    expect(result.error).toBe(false);
    expect(result.snapshots.map((row)=>row.id)).toEqual(ownerRows.map((row)=>row.id));
    expect(calls).toEqual([["pawos-user-1","0-1"],["pawos-user-1","2-3"]]);
    calls.length = 0;
    const limited = await loadChronicleProfileSnapshots(supabase,"pawos-user-1",2,2);
    expect(limited.truncated).toBe(true);
    expect(limited.snapshots).toHaveLength(2);
    expect(calls).toEqual([["pawos-user-1","0-1"],["pawos-user-1","2-2"]]);
  });
});
