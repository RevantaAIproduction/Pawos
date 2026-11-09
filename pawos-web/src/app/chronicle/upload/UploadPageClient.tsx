"use client";

import { useState } from "react";
import styles from "./upload.module.css";

export function UploadPageClient({ text, label, compact = false }: { text: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return compact ? (
    <button type="button" className={styles.copyPrompt} onClick={copy}>{copied ? "Copied" : "Copy prompt"}</button>
  ) : (
    <div className={styles.command}>
      <code>{text}</code>
      <button type="button" aria-label={label} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
