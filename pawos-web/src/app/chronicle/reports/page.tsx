import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import styles from "./reports.module.css";

export const metadata = { title: "Chronicle Reports", robots: { index: false, follow: false } };
export default async function ChronicleReportsPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login?next=%2Fchronicle%2Freports");
  const { data, error } = await account.supabase.from("chronicle_reports").select("id,project_name,created_at,report_data").eq("user_id", account.user.id).order("created_at", { ascending: false }).limit(100);
  const reports = data ?? [];
  return <main className={styles.page}>
    <div className={styles.kicker}>YOUR PRIVATE HISTORY</div><div className={styles.heading}><div><h1>Reports</h1><p>Every upload is kept as a separate snapshot. New activity is compared with your previous project report.</p></div><Link href="/chronicle/upload" className={styles.upload}>Upload a report +</Link></div>
    {error ? <div className={styles.message}>Chronicle storage is not available yet. Apply the Chronicle database migration, then reload this page.</div> : reports.length === 0 ? <div className={styles.empty}><span>◇</span><h2>No reports saved yet.</h2><p>Create a report locally. When you choose cloud history, sign in and review the upload preview before sending it.</p><Link href="/chronicle/upload">See how to get started →</Link></div> : <div className={styles.list}>{reports.map((report, index) => {
      const projectId = report.report_data?.project?.localProjectId ?? report.id;
      const current = new Set<string>(report.report_data?.git?.commitIds ?? []);
      const olderReport = reports.slice(index + 1).find((item) => item.report_data?.project?.localProjectId === projectId);
      const older = new Set<string>(olderReport?.report_data?.git?.commitIds ?? []);
      const newCommits = [...current].filter((id) => !older.has(id)).length;
      const sessions = new Set<string>(report.report_data?.agents?.sessions?.map((session: {sessionKey:string}) => session.sessionKey) ?? []);
      const olderSessions = new Set<string>(olderReport?.report_data?.agents?.sessions?.map((session: {sessionKey:string}) => session.sessionKey) ?? []);
      const newSessions = [...sessions].filter((id) => !olderSessions.has(id)).length;
      const git = report.report_data?.git;
      return <Link className={styles.row} key={report.id} href={`/chronicle/reports/${report.id}`}><div className={styles.rowTitle}><span className={styles.project}>{report.project_name}</span><span className={styles.date}>{new Date(report.created_at).toLocaleDateString()}</span></div><div className={styles.tags}><span>{Number(git?.commitCount ?? 0).toLocaleString()} commits observed</span><span>{Number(git?.fileChanges ?? 0).toLocaleString()} file changes</span><span>{newCommits.toLocaleString()} new commit(s)</span><span>{Number(report.report_data?.agents?.metrics?.sessionCount ?? 0).toLocaleString()} sessions · {newSessions.toLocaleString()} new</span></div><b>View report →</b></Link>;
    })}</div>}
  </main>;
}
