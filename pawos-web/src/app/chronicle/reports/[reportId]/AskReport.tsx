"use client";

import { useState } from "react";
import styles from "./report.module.css";

export function AskReport({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true); setAnswer("");
    try {
      const response = await fetch(`/api/chronicle/reports/${reportId}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const result = await response.json();
      setAnswer(response.ok && result.ok ? result.answer : result.message || "This report could not be queried.");
    } catch { setAnswer("This report could not be queried. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className={styles.askWrap}>
    {open && <section className={styles.askPanel} aria-label="Ask about this report"><header><strong>Ask about this report</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></header><p>Answers use only this report&apos;s approved fields. Questions are not sent to an AI service.</p>{answer && <div className={styles.answer}>{answer}</div>}<form onSubmit={(event) => void ask(event)}><input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="Ask about the Git activity…" /><button disabled={busy}>{busy ? "…" : "Ask"}</button></form></section>}
    <button type="button" className={styles.askButton} onClick={() => setOpen((value) => !value)}><span>◌</span> Ask anything about this report</button>
  </div>;
}
