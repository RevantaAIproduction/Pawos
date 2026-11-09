"use client";

import { useState } from "react";
import styles from "./report.module.css";

export function ReportActions({ reportId, initialToken }: { reportId: string; initialToken: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle() {
    if (busy) return;
    if (token && !window.confirm("Revoke public access now? Anyone with the current link will lose access.")) return;
    if (!token && !window.confirm("Make this report public? Anyone with its link will be able to view its sanitized Git activity report.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/chronicle/reports/${reportId}/share`, { method: token ? "DELETE" : "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Sharing could not be changed.");
      setToken(token ? null : result.shareToken);
      setMessage(token ? "Public access has been revoked." : "Public access is enabled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sharing could not be changed."); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!token) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/chronicle/share/${token}`); setMessage("Public link copied."); }
    catch { setMessage("Couldn't copy the link. Select it below and copy it."); }
  }
  return <div className={styles.shareBox}>
    <button className={styles.shareButton} type="button" onClick={() => void toggle()} disabled={busy}>{busy ? "Updating…" : token ? "Revoke public access" : "Share report"}</button>
    {token && <><button className={styles.copyButton} type="button" onClick={() => void copy()}>Copy link</button><code className={styles.shareUrl}>/chronicle/share/{token}</code></>}
    {message && <span role="status" className={styles.shareMessage}>{message}</span>}
  </div>;
}
