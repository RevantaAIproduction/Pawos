import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { aggregateChronicleProfile, loadChronicleProfileSnapshots, type ChronicleProfileDatabase } from "../../../lib/chronicle/historicalProfile";
import styles from "./reports.module.css";

export const metadata = { title: "Chronicle Reports", robots: { index: false, follow: false } };
const PROFILE_PAGE_SIZE = 50;
const PROFILE_REPORT_LIMIT = 5000;
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : "Unavailable";
const n = (value: number | undefined) => Number(value || 0).toLocaleString("en-US");
export default async function ChronicleReportsPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login?next=%2Fchronicle%2Freports");
  const loaded = await loadChronicleProfileSnapshots(account.supabase as unknown as ChronicleProfileDatabase, account.user.id, PROFILE_PAGE_SIZE, PROFILE_REPORT_LIMIT);
  const profileSnapshots = loaded.snapshots;
  const error = loaded.error;
  const profileTruncated = loaded.truncated;
  const profile = aggregateChronicleProfile(profileSnapshots);
  const reports = [...profileSnapshots].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)).slice(0,100);
  return <main className={styles.page}>
    <div className={styles.kicker}>YOUR PRIVATE HISTORY</div><div className={styles.heading}><div><h1>Reports</h1><p>Every upload is kept as a separate snapshot. New activity is compared with your previous project report.</p></div><Link href="/chronicle/upload" className={styles.upload}>Upload a report +</Link></div>
    {error ? <div className={styles.message}>Chronicle history could not be loaded. Check that the report migration is available, then reload this page.</div> : reports.length === 0 ? <div className={styles.empty}><span>◇</span><h2>No reports saved yet.</h2><p>Create a report locally. When you choose cloud history, sign in and review the upload preview before sending it.</p><Link href="/chronicle/upload">See how to get started →</Link></div> : <>
    <section id="developer-profile" className={styles.profile}>
      <div className={styles.kicker}>ACCOUNT-LEVEL · PRIVATE</div><h2>Your Development Profile</h2><p className={styles.profileIntro}>Rebuilt deterministically from your immutable PawOS report snapshots. Evidence is deduplicated within each project; project and episode identities remain separate. No scores or archetypes are assigned.</p>
      {profileTruncated && <div className={styles.message}>Only the most recent {n(PROFILE_REPORT_LIMIT)} report snapshots were included; older history is not part of this profile.</div>}
      <div className={styles.profileMetrics}><span><b>{n(profile.projectCount)}</b>projects</span><span><b>{n(profile.uniqueSnapshotCount)}</b>unique snapshots</span><span><b>{n(profile.uniqueEvidenceCount)}</b>unique evidence references</span><span><b>{n(profile.repeatedSnapshotUploads)}</b>duplicate uploads excluded from evidence counts</span></div>
      {profile.projects.map((project) => <article className={styles.profileProject} key={project.projectId}>
        <div className={styles.profileProjectHeading}><div><h3>{project.projectName}</h3><span>{n(project.uniqueSnapshotCount)} unique snapshots · {n(project.uploadedReportCount)} saved rows · {n(project.episodeCount)} project-scoped episodes</span></div><small>First observed {dateLabel(project.firstObservedAt)}<br />Last observed {dateLabel(project.lastObservedAt)}</small></div>
        <details className={styles.profileSources}><summary>Source coverage</summary><p>Last recorded {dateLabel(project.sourceCoverage.observedAt)}. Configuration and activity markers do not establish use. Parsed activity requires a supported adapter and the required approval.</p>{"detectedAgents" in project.sourceCoverage ? <>{(project.sourceCoverage.detectedAgents || []).map((agent)=><div key={agent.agentId}><b>{agent.agentId}</b> · configuration {agent.configurationDetected?"detected":"not detected"} · activity marker {agent.activityDetected?"detected":"not detected"} · {agent.parserStatus} · usage {agent.activityEvidenceObserved?"observed":"not established"}</div>)}{[...(project.sourceCoverage.projectLocalSources || []),...(project.sourceCoverage.externalSources || [])].map((source,index)=><div key={`${source.sourceId}-${index}`}><b>{source.sourceId}</b> · {source.inspectionStatus||source.status} · {source.consentStatus||source.approvalStatus||"consent unavailable"} · {n(source.sessionsMatched)} sessions · {source.limitation}</div>)}</> : <>{project.sourceCoverage.limitation}<p>Legacy source availability: {JSON.stringify(project.sourceCoverage.legacyAvailability||{})}</p>{project.sourceCoverage.legacySourceCoverage.map((source,index)=><div key={`${source.sourceId}-${index}`}><b>{source.sourceId}</b> · {n(source.filesRead)} file(s) parsed · {n(source.matchedSessions)} matched session(s) · {n(source.skippedFiles)} skipped</div>)}</>}</details>
        <section className={styles.profileArea}><h4>Engineering outcomes <small>deduplicated by project</small></h4><p>{n(project.outcomes.uniqueCount)} unique outcome records across this project’s snapshots. Tool success is not verification; inferred links do not establish authorship or completion.</p>{project.outcomes.items.map((item)=><div className={styles.profileObservation} key={item.outcomeId}><b>{item.category.replaceAll("_"," ")} · {item.states.join(" / ")}</b><span>{item.classifications.join(" / ")} · {item.confidenceLevels.join(" / ")} confidence · {item.relationshipTypes.join(" / ")}</span><small>{item.uniqueSnapshots} snapshot(s) · first {dateLabel(item.firstObservedAt)} · last {dateLabel(item.lastObservedAt)}</small><small>Activity references: {item.activityRefs.length} · result references: {item.resultRefs.length}{item.conflictingEvidence?" · conflicting evidence":""}</small>{item.limitations.map((text:string,index:number)=><small key={index}>{text}</small>)}</div>)}{!project.outcomes.items.length&&<p>No outcome records are available in these report snapshots.</p>}</section>
        {project.areas.map((area)=><section className={styles.profileArea} key={area.key}><h4>{area.title} <small>{area.status==="observed"?"evidence present":"not assessed"}</small></h4>{!area.observations.length?<p>No observation is available in these snapshots.</p>:area.observations.map((item,index)=><div className={styles.profileObservation} key={`${item.signal}-${index}`}>
          <b>{item.signal.replaceAll("_"," ")}</b><span>{item.classifications.join(" / ")||item.classification} · {item.confidenceLevels.join(" / ")||item.confidence} confidence</span><p>{item.description}</p>
          <small>{n(item.uniqueEvidenceCount)} unique evidence references · {item.coverage.latest?.truncated||item.coverage.history.some((entry)=>entry.truncated)?"at least ":""}{n(item.distinctSessions)} session(s) · {n(item.uniqueSnapshots)} unique snapshots · {item.recurrence.replaceAll("_"," ")}</small>
          <small>First observed {dateLabel(item.firstObservedAt)} · Last observed {dateLabel(item.lastObservedAt)}</small>
          {item.conflictingEvidence&&<div className={styles.message}>Evidence classification or confidence varies across snapshots; Chronicle preserves the variants instead of averaging them.</div>}
          {item.coverage.latest&&<small>Latest coverage: {n(item.coverage.latest.referencesIncluded)} of {n(item.coverage.latest.totalAvailable)} references · {n(item.coverage.latest.omitted)} omitted{item.coverage.latest.truncated?" · truncated":""}{item.coverage.latest.unavailableReason!=="not_applicable"?` · ${item.coverage.latest.unavailableReason.replaceAll("_"," ")}`:""}</small>}
          {item.coverage.history.length>1&&<details><summary>Coverage history</summary>{item.coverage.history.map((history)=><div key={history.snapshotHash}>{dateLabel(history.observedAt)} · {n(history.referencesIncluded)} / {n(history.totalAvailable)} refs · {n(history.omitted)} omitted{history.truncated?" · truncated":""} · <Link href={`/chronicle/reports/${history.reportId}`}>Open snapshot</Link></div>)}</details>}
          {item.limitations.map((limitation:string,i:number)=><small key={i}>Limit: {limitation}</small>)}<small>Observation: {item.observationIds.join(", ")||"unavailable"}</small><small>Source snapshots: {item.sourceReports.map((source)=><span key={source.reportId}><Link href={`/chronicle/reports/${source.reportId}`}>{dateLabel(source.observedAt)}</Link> · </span>)}{item.sourceReportCount>item.sourceReports.length?`${n(item.sourceReportCount-item.sourceReports.length)} earlier snapshot(s) omitted`:""}</small>
        </div>)}</section>)}
      </article>)}
      {profile.limitations.map((limitation,index)=><p className={styles.profileLimit} key={index}>{limitation}</p>)}
      <p className={styles.profileLimit}>Removing a report removes its evidence from the next rebuild. Duplicate uploads remain separate saved snapshots but do not add duplicate evidence.</p>
    </section>
    <div className={styles.list}>{reports.map((report, index) => {
      const projectId = report.report_data?.project?.localProjectId ?? report.id;
      const current = new Set<string>(report.report_data?.git?.commitIds ?? []);
      const olderReport = reports.slice(index + 1).find((item) => item.report_data?.project?.localProjectId === projectId);
      const older = new Set<string>(olderReport?.report_data?.git?.commitIds ?? []);
      const newCommits = [...current].filter((id) => !older.has(id)).length;
      const sessions = new Set<string>(report.report_data?.agents?.sessions?.map((session: {sessionKey?:string}) => session.sessionKey).filter((key: string | undefined): key is string => Boolean(key)) ?? []);
      const olderSessions = new Set<string>(olderReport?.report_data?.agents?.sessions?.map((session: {sessionKey?:string}) => session.sessionKey).filter((key: string | undefined): key is string => Boolean(key)) ?? []);
      const newSessions = [...sessions].filter((id) => !olderSessions.has(id)).length;
      const git = report.report_data?.git;
      return <Link className={styles.row} key={report.id} href={`/chronicle/reports/${report.id}`}><div className={styles.rowTitle}><span className={styles.project}>{report.project_name}</span><span className={styles.date}>{new Date(report.created_at).toLocaleDateString()}</span></div><div className={styles.tags}><span>{Number(git?.commitCount ?? 0).toLocaleString()} commits observed</span><span>{Number(git?.fileChanges ?? 0).toLocaleString()} file changes</span><span>{newCommits.toLocaleString()} new commit(s)</span><span>{Number(report.report_data?.agents?.metrics?.sessionCount ?? 0).toLocaleString()} sessions · {newSessions.toLocaleString()} new</span></div><b>View report →</b></Link>;
    })}</div></>}
  </main>;
}
