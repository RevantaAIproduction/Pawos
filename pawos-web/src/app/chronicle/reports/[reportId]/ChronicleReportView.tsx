import Link from "next/link";
import type { ChronicleReport } from "../../../../lib/chronicle/reportSchema";
import { ReportActions } from "./ReportActions";
import { AskReport } from "./AskReport";
import styles from "./report.module.css";

type SavedReport = { id: string; project_name: string; created_at: string; share_token: string | null; report_data: ChronicleReport };
const n = (value: number) => value.toLocaleString("en-US");

export function ChronicleReportView({ saved, readOnly = false }: { saved: SavedReport; readOnly?: boolean }) {
  const report = saved.report_data;
  const topCategories = [...report.git.fileCategories].sort((a,b) => b.changes-a.changes).slice(0,4);
  const activity = report.git.activityByDay.slice(-32);
  const agentMetrics = report.agents.metrics;
  const sessionCount = Number(agentMetrics.sessionCount);
  const leadingModel = Object.entries(agentMetrics.modelCounts as Record<string, number>).sort((a,b) => b[1]-a[1])[0];
  const max = Math.max(1, ...activity.map((item) => item.commits));
  return <main className={styles.page}>
    {!readOnly && <Link href="/chronicle/reports" className={styles.back}>← Back to Reports</Link>}
    <div className={styles.titleRow}><div><div className={styles.kicker}>REPORT SNAPSHOT · {new Date(saved.created_at).toLocaleDateString()}</div><h1>{saved.project_name}</h1><p>{n(report.git.commitCount)} Git commits · {new Date(saved.created_at).toLocaleDateString()}</p></div>{!readOnly && <ReportActions reportId={saved.id} initialToken={saved.share_token} />}</div>
    <p className={styles.lede}>{report.developmentStory}</p>
    <div className={styles.insights}>
      <article className={`${styles.insight} ${styles.tiltA}`}><div className={styles.pattern}><span>⎇</span><i>GIT ACTIVITY</i></div><small>What does the history show?</small><strong>{n(report.git.commitCount)} commits</strong><p>{n(report.git.fileChanges)} file-change records in the observed history.</p></article>
      <article className={`${styles.insight} ${styles.tiltB}`}><div className={`${styles.pattern} ${styles.patternAlt}`}><span>◇</span><i>ATTRIBUTION</i></div><small>Who authored this work?</small><strong>Unknown from Git</strong><p>Commit metadata alone does not establish manual or AI authorship.</p></article>
      <article className={`${styles.insight} ${styles.tiltC}`}><div className={styles.pattern}><span>▤</span><i>WORK MIX</i></div><small>What changed?</small><strong>{topCategories[0]?.category ?? "No changes"}</strong><p>{topCategories[0] ? `${n(topCategories[0].changes)} file-change records in the leading category.` : "No changed files were recorded."}</p></article>
      <article className={`${styles.insight} ${styles.tiltD}`}><div className={`${styles.pattern} ${styles.patternAlt}`}><span>◷</span><i>SOURCE COVERAGE</i></div><small>Are agent sessions included?</small><strong>{sessionCount ? n(sessionCount) + " sessions" : "None matched"}</strong><p>{sessionCount ? "Approved local session summaries are included." : "A configured tool is not evidence of session use."}</p></article>
    </div>
    <article className={styles.narrative}><div className={styles.sectionLabel}>YOUR DEVELOPMENT STORY</div><p>{report.developmentStory}</p></article>

    <section className={styles.section}><h2>What You Built</h2><p>This snapshot describes repository activity for <b>{saved.project_name}</b>. It records {n(report.git.commitCount)} commits, {n(report.git.fileChanges)} file-change records, {n(report.git.currentBranchCount)} current branches and {n(report.git.mergeCommitCount)} merge commits. Chronicle does not read project source files or commit messages in this release.</p><div className={styles.metrics}><div><b>+{n(report.git.insertions)}</b><span>line insertions</span></div><div><b>−{n(report.git.deletions)}</b><span>line deletions</span></div><div><b>{n(report.git.currentBranchCount)}</b><span>current branches</span></div><div><b>{report.git.historyTruncated ? "2,000+" : n(report.git.commitCount)}</b><span>commits observed</span></div></div></section>

    <section className={styles.section}><h2>Decision Patterns</h2><p>{sessionCount ? "Approved transcripts contain " + n(Number(agentMetrics.planningSignals)) + " planning-language signals and " + n(Number(agentMetrics.correctionSignals)) + " correction-language signals. These are simple text-pattern counts, not a judgement of decision quality. Git/session date overlap is temporal context only." : "Git history can show when the repository changed, but without matched session records it cannot reveal planning, prompt choices, debugging decisions, or who made them."}</p></section>
    <section className={styles.section}><h2>Strengths</h2><p>Chronicle does not assign strengths from session volume or Git counts alone. Current evidence supports activity summaries, but not validated developer scoring or archetype assignment.</p></section>
    <section className={styles.section}><h2>Growth Areas</h2><p>This report does not infer a growth area without sufficient evidence. Tests, builds, and verification results are not collected by the current release.</p></section>
    <section className={styles.section}><h2>How You Use AI</h2><p>{sessionCount ? "Chronicle found " + n(sessionCount) + " approved local sessions. The most frequently recorded model identifier is " + (leadingModel ? leadingModel[0] + " (" + n(leadingModel[1]) + " sessions)" : "unavailable") + ". Prompt length averages " + (agentMetrics.averagePromptWords === null ? "unavailable" : n(Number(agentMetrics.averagePromptWords)) + " words") + " across captured user turns. Raw prompt text is not shown or stored in the report." : "No supported agent-session records were included, so Chronicle cannot determine whether AI tools were used, which models were selected, or how work was steered. A tool installation is not treated as use."}</p><p>{sessionCount ? "The session and Git timelines overlap on " + n(Number(agentMetrics.overlappingGitDays)) + " dates, including " + n(Number(agentMetrics.gitCommitsOnSessionDays)) + " commits on those dates. This is temporal correlation only and does not attribute commits to an agent." : ""}</p></section>

    <section className={styles.section}><h2>Your Engineering Journey</h2><p>Each upload is preserved as a separate snapshot. Later snapshots can be compared by hashed commit identifiers so previously observed Git history is not added twice.</p><div className={styles.chart}>{activity.length ? activity.map((item) => <div className={styles.bar} key={item.day} title={`${item.day}: ${item.commits} commits`}><i style={{height:`${Math.max(4, item.commits/max*100)}%`}} /></div>) : <span>No dated commit activity is available.</span>}</div>{activity.length > 0 && <div className={styles.chartCaption}>Daily Git commits · latest {activity.length} active dates</div>}</section>
    <section className={styles.section}><h2>Changed File Categories</h2>{topCategories.length ? <div className={styles.categoryList}>{topCategories.map((item) => <div key={item.category}><span>{item.category}</span><b>{n(item.changes)}</b></div>)}</div> : <p>No changed-file categories are available.</p>}</section>
    <section className={styles.section}><h2>Evidence &amp; Coverage</h2><p>Git metadata and approved session transcripts were analyzed locally. Only derived session counts and signals reached PawOS. Raw prompts, replies, tool output, source contents, complete diffs, commit messages, author identities and absolute project paths were not sent.</p><div className={styles.coverage}>Git history <b>Included</b><span>Approved agent sessions <b>{sessionCount ? n(sessionCount) + " included" : "None matched"}</b></span><span>IDE and test/build runs <b>Not implemented</b></span><span>Manual/AI authorship <b>Unknown</b></span></div></section>
    {!readOnly && <section className={styles.next}><h2>Your Next Evolution</h2><p>Future snapshots can add supported verification sources while preserving this immutable report.</p><Link href="/chronicle/upload">Review upload and source coverage →</Link></section>}
    <footer className={styles.reportFooter}>CHRONICLE · PRIVATE BY DEFAULT · SNAPSHOT {saved.id}</footer>
    {!readOnly && <AskReport reportId={saved.id} />}
  </main>;
}
