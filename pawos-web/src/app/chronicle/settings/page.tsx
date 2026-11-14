import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import styles from "./settings.module.css";
import { DeleteCloudReports } from "./DeleteCloudReports";

export const metadata = { title: "Chronicle Settings", robots: { index: false, follow: false } };
export default async function ChronicleSettingsPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login?next=%2Fchronicle%2Fsettings");
  const { count, error } = await account.supabase.from("chronicle_reports").select("id", { count: "exact", head: true }).eq("user_id", account.user.id);
  return <main className={styles.page}><div className={styles.kicker}>YOUR CHRONICLE DATA</div><h1>Settings</h1><p>Chronicle uses your existing PawOS account for optional cloud report storage. Local scanning remains on your device.</p><section><h2>Cloud snapshots</h2><p>{error ? "Report storage is not available until the Chronicle database migration is applied." : `${count ?? 0} report snapshots are saved to your PawOS account.`}</p><p>Reports stay private until you explicitly enable public sharing. Revoke a public link from its report page at any time.</p><Link href="/chronicle/reports">Review and manage report history →</Link><DeleteCloudReports /></section><section><h2>Local data</h2><p>Local JSON reports and source grants are kept in your operating system&apos;s user application-data folder. The browser cannot read or remove those files.</p><code>curl -fsSL https://pawos.revantaai.com/chronicle/run | bash -s -- reports</code><code>curl -fsSL https://pawos.revantaai.com/chronicle/run | bash -s -- forget</code><p>The forget command asks for confirmation before deleting Chronicle&apos;s local grants, events, reports and project identity key. These launcher commands become usable when the verified public release is deployed.</p></section><section><h2>Evidence coverage</h2><p>Local report generation analyzes Git metadata and, after exact-file approval, Aider project chat history. Claude Code, Codex CLI and Gemini CLI records are available only from explicitly approved external stores. Other listed tools are detection-only. IDE interaction, test runs, build runs and CI outcomes are not currently parsed.</p><Link href="/chronicle/upload">View source availability and privacy details →</Link></section></main>;
}
