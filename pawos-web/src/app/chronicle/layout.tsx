import type { ReactNode } from "react";
import Link from "next/link";
import { getAccountContext } from "../../lib/account/accountContext";
import styles from "./chronicle.module.css";

export const dynamic = "force-dynamic";

export default async function ChronicleLayout({ children }: { children: ReactNode }) {
  const account = await getAccountContext();
  return <div className={styles.app}>
    <header className={styles.topbar}>
      <Link href="/chronicle" className={styles.brand}><span className={styles.mark}>C</span><span>CHRONICLE<small>DEVELOPMENT INTELLIGENCE</small></span></Link>
      <nav className={styles.links} aria-label="Chronicle"><Link href="/chronicle/reports">Reports</Link><Link href="/chronicle/upload">Upload</Link></nav>
      <div className={styles.actions}><Link href="/" className={styles.back}>← PawOS</Link>
        <details className={styles.account}><summary aria-label="Chronicle account menu">{account?.displayName?.slice(0,1).toUpperCase() ?? "◇"}</summary><div className={styles.menu}><strong>{account?.displayName ?? "Local analysis"}</strong>{account?.user.email && <small>{account.user.email}</small>}<Link href="/chronicle/settings">Chronicle settings</Link>{account ? <Link href="/dashboard/settings">PawOS account</Link> : <Link href="/login?next=%2Fchronicle%2Freports">Sign in to PawOS</Link>}</div></details>
      </div>
    </header>
    <div className={styles.body}>{children}</div>
    <footer className={styles.footer}><span>CHRONICLE</span><span>Local first · Evidence over assumptions</span><Link href="/">← Back to PawOS website</Link></footer>
  </div>;
}
