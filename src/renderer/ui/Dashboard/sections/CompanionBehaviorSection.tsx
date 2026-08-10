import React from 'react';
import styles from '../dashboard.module.css';
import { Toggle } from '../Toggle';

/**
 * Global desktop-companion behavior toggles only — personality, memory, and
 * per-companion voice/appearance are edited in Companion Studio, not here.
 * The reaction toggles below are honestly disabled: the live 3D companion
 * has no keyboard/mouse reaction behavior to wire them to (see
 * CompanionController.ts's dormant legacy 2D pipeline).
 */
export function CompanionBehaviorSection({ onOpenCompanionStudio }: { onOpenCompanionStudio: () => void }) {
  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Desktop reactions</h3>
        <label className={styles.settingsToggleRow}>
          <span>React to keyboard activity</span>
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>
        <label className={styles.settingsToggleRow}>
          <span>React to mouse activity</span>
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>
        <p className={styles.cardBody} style={{ marginTop: 8 }}>
          The live 3D companion doesn't react to keyboard or mouse input yet, so these can't do
          anything today — shown here so they're ready the moment that ships, not to imply they
          already work.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Personality, memory &amp; appearance</h3>
        <p className={styles.cardBody}>
          Edit your companion's personality, voice, memory, and 3D appearance in Companion Studio.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={onOpenCompanionStudio}>
          Open Companion Studio
        </button>
      </div>
    </div>
  );
}
