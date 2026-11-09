"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

export function DeleteCloudReports() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm("Permanently delete every Chronicle report in your PawOS account? This also disables all public links. This cannot be undone.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/chronicle/reports", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Reports could not be deleted.");
      setMessage(`${result.deleted} cloud report${result.deleted === 1 ? "" : "s"} deleted.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reports could not be deleted."); }
    finally { setBusy(false); }
  }
  return <div className={styles.danger}><button type="button" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete all cloud reports"}</button>{message && <span role="status">{message}</span>}</div>;
}
