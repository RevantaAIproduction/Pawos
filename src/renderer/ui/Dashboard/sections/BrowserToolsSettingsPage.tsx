import React from 'react';
import styles from '../dashboard.module.css';

/** Honest placeholder — the real browser-preference-order store (browserPreferences.ts) has no UI yet; this tab wires it up in a future update. */
export function BrowserToolsSettingsPage() {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Browser Tools settings are coming in a future update</h3>
      <p className={styles.cardBody} style={{ marginTop: 6 }}>
        PawOS already picks a browser automatically for preview and research tasks. Controls for
        preferred browser order, allowed sites, and session persistence will live here once built.
      </p>
    </div>
  );
}
