import React from 'react';
import styles from '../dashboard.module.css';

/**
 * Honestly disabled: the live 3D companion runtime (CompanionRuntime.ts,
 * Avatar3DOverlay.tsx) never reads animationSpeed — it was wired only to the
 * dormant legacy 2D companion controller, which no longer mounts. Kept here,
 * disabled, so it's ready the moment the 3D stack gains a speed control,
 * rather than implying it already works.
 */
export function PerformanceSection() {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Companion animation</h3>
      <label className={styles.settingsSliderRow}>
        <span>Animation speed: 1.00x</span>
        <input type="range" min={0.5} max={1.8} step={0.05} value={1} disabled onChange={() => {}} />
      </label>
      <p className={styles.cardBody} style={{ marginTop: 8 }}>
        The 3D companion doesn't support adjustable animation speed yet, so this control has no
        effect today — it's shown here so it's ready the moment that ships.
      </p>
    </div>
  );
}
