import React from 'react';
import styles from '../dashboard.module.css';

/** Honest placeholder — real per-provider model/key configuration and companion memory controls are planned for a future update; PawOS routes reasoning automatically today. */
export function AISettingsPage() {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>AI settings are coming in a future update</h3>
      <p className={styles.cardBody} style={{ marginTop: 6 }}>
        PawOS currently routes reasoning automatically — there's no per-provider model or API key
        configuration to manage yet. This tab will let you choose providers and models, and view
        or clear your companion's memory, once that's built.
      </p>
    </div>
  );
}
