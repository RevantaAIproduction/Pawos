import React from 'react';
import styles from '../dashboard.module.css';
import { Toggle } from '../Toggle';

/**
 * Global audio output only (volume/mute). Per-companion voice identity,
 * speed, and emotion (TTS provider selection) live in Companion Studio's
 * own Voice tab — CompanionEditorPanel.tsx — and aren't duplicated here.
 * Honestly disabled: soundVolume/muted only ever fed the dormant legacy 2D
 * companion controller (CompanionController.ts's loadPetAndStart(), which
 * nothing triggers now that the 3D stack is authoritative) — no live audio
 * path reads either value today.
 */
export function VoicePreferencesSection({ onOpenCompanionStudio }: { onOpenCompanionStudio: () => void }) {
  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Sound</h3>
        <label className={styles.settingsSliderRow}>
          <span>Volume: 60%</span>
          <input type="range" min={0} max={1} step={0.01} value={0.6} disabled onChange={() => {}} />
        </label>
        <label className={styles.settingsToggleRow}>
          <span>Mute all sound</span>
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>
        <p className={styles.cardBody} style={{ marginTop: 8 }}>
          These controls have no effect today — shown here so they're ready the moment the
          companion's audio output is wired to a live volume/mute control.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Companion voice</h3>
        <p className={styles.cardBody}>
          Choose each companion's voice identity (including male/female-presenting voices), speed,
          and emotion in Companion Studio → Edit → Voice — that's the one place voice identity is
          set, since each companion can have its own voice rather than a single app-wide choice.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={onOpenCompanionStudio}>
          Open Companion Studio
        </button>
      </div>
    </div>
  );
}
