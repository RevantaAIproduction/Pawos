"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import styles from "./authorized.module.css";

/** Where PawOS desktop's connector relay listener (src/main/connectivity/OAuthManager.ts,
 *  buildConnectorAuthorizedPageUrl) sends the browser once it has received the authorization
 *  code. The code itself never reaches this page — only the connector id and an outcome. */
const CONNECTOR_NAMES: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  linear: "Linear",
  slack: "Slack",
  vercel: "Vercel",
  netlify: "Netlify",
  railway: "Railway",
  microsoft: "Microsoft 365",
  googleWorkspace: "Google Workspace",
};

const PawOSLogo = () => (
  <svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="48" height="48" rx="12" fill="#2563EB" />
    <path d="M24 12C17.3726 12 12 17.3726 12 24C12 30.6274 17.3726 36 24 36C30.6274 36 36 30.6274 36 24C36 17.3726 30.6274 12 24 12ZM24 32C19.5817 32 16 28.4183 16 24C16 19.5817 19.5817 16 24 16C28.4183 16 32 19.5817 32 24C32 28.4183 28.4183 32 24 32Z" fill="white" />
    <circle cx="24" cy="24" r="4" fill="white" />
  </svg>
);

function AuthorizedContent() {
  const searchParams = useSearchParams();
  const connectorId = searchParams.get("connector") ?? "";
  const status = searchParams.get("status");
  const message = searchParams.get("message");
  const name = CONNECTOR_NAMES[connectorId] ?? "your account";

  if (status === "error") {
    return (
      <>
        <h1 className={styles.title}>Couldn&apos;t connect {name}</h1>
        <p className={styles.lead}>The authorization didn&apos;t complete{message ? ":" : "."}</p>
        {message && <p className={styles.errorBox}>{message}</p>}
        <p className={styles.hint}>Return to PawOS and choose <strong>Connect</strong> again from Settings → Connections.</p>
      </>
    );
  }

  if (status === "expired") {
    return (
      <>
        <h1 className={styles.title}>This sign-in link has expired</h1>
        <p className={styles.lead}>PawOS wasn&apos;t waiting for this authorization anymore — it may have timed out or already finished.</p>
        <p className={styles.hint}>Check Settings → Connections in PawOS. If {name} isn&apos;t connected, choose <strong>Connect</strong> again.</p>
      </>
    );
  }

  return (
    <>
      <div className={styles.badge} aria-hidden="true">✓</div>
      <h1 className={styles.title}>{name} authorized</h1>
      <p className={styles.lead}>PawOS received your authorization and is finishing the connection.</p>
      <ul className={styles.steps}>
        <li>Switch back to the PawOS app.</li>
        <li>{name} will show as <strong>Connected</strong> in Settings → Connections.</li>
        <li>You can disconnect it there at any time.</li>
      </ul>
      <p className={styles.hint}>You can close this tab.</p>
    </>
  );
}

export default function ConnectorAuthorizedPage() {
  return (
    <div className={styles.container}>
      <main className={styles.card}>
        <PawOSLogo />
        <React.Suspense fallback={<p className={styles.lead}>Loading…</p>}>
          <AuthorizedContent />
        </React.Suspense>
        <p className={styles.footnote}>PawOS never sees your password. Access is granted through the provider&apos;s own sign-in.</p>
      </main>
    </div>
  );
}
