import React from 'react';
import styles from './dashboard.module.css';

export type LiveState = 'live' | 'idle' | 'off' | 'error';

/**
 * A pulsing status dot + label — the one primitive every "this is alive"
 * surface in Settings uses (Home status strip, connector cards, page
 * headers) instead of a static "Connected" chip. `state` maps to color;
 * `label` is the only place actual meaning lives, so nothing here invents a
 * claim the caller didn't already know to be true.
 */
export function LiveStatusPill({ state, label }: { state: LiveState; label: React.ReactNode }) {
  return (
    <span className={styles.liveStatusRow}>
      <span className={styles.liveDot} data-state={state} />
      {label}
    </span>
  );
}
