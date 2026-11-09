import Link from "next/link";
import { getAccountContext } from "../../lib/account/accountContext";
import styles from "./hub.module.css";

export default async function ChronicleHome() {
  const account = await getAccountContext();
  return <main className={styles.page}>
    <div className={styles.kicker}>LOCAL FIRST · PAWOS OPTIONAL</div>
    <h1>Understand the work<br /><em>behind what you build.</em></h1>
    <p className={styles.lead}>Chronicle turns selected project evidence into a private development story. Start locally; choose whether to save a sanitized report to your PawOS account.</p>
    <div className={styles.actions}><Link href="/chronicle/upload" className={styles.primary}>Create a local report <span>→</span></Link><Link href="/chronicle/reports" className={styles.secondary}>Report history</Link></div>
    <div className={styles.grid}><article><span>01 / EVIDENCE</span><h2>Git history, with limits</h2><p>Current reports summarize Git activity and keep authorship unknown unless independent evidence becomes available.</p></article><article><span>02 / PRIVACY</span><h2>You approve each upload</h2><p>Review the exact sanitized report fields before anything is sent to PawOS. Cloud snapshots stay private unless shared explicitly.</p></article><article><span>03 / COVERAGE</span><h2>Clear about what is missing</h2><p>Agent sessions, IDE activity, test runs and builds are not yet collected. Chronicle will not fill those gaps with guesses.</p></article></div>
    <div className={styles.accountNote}>{account ? `Signed in to PawOS as ${account.displayName}.` : "You are not signed in. Local analysis still works; sign in only when saving a cloud report."}</div>
  </main>;
}
