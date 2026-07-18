import React from 'react';
import styles from '../dashboard.module.css';
import { AvatarPreview } from './AvatarPreview';

export function TalkSection({
  enabled,
  pending,
  onEnable,
  onDisable,
}: {
  enabled: boolean;
  pending: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  return (
    <div>
      <div className={styles.companionPanel}>
        {enabled ? (
          <AvatarPreview active={enabled} />
        ) : (
          <div className={styles.companionOrbWrap}>
            <div className={styles.companionOrbGlow} data-on={enabled} />
            <div className={styles.companionOrb} data-on={enabled} />
          </div>
        )}
        <h3 className={styles.companionState}>{enabled ? 'Your companion is active' : 'Your companion is off'}</h3>
        <p className={styles.cardBody}>
          {enabled
            ? 'It is running as a desktop overlay — animated, listening for input, and ready to talk.'
            : 'Enable it to bring your animated desktop companion to life. It will appear as a small always-on-top overlay.'}
        </p>
        <button
          type="button"
          className={enabled ? styles.dangerButton : styles.primaryButton}
          disabled={pending}
          onClick={enabled ? onDisable : onEnable}
        >
          {pending ? 'Working…' : enabled ? 'Disable companion' : 'Enable companion'}
        </button>
      </div>

      <h3 className={styles.subheading}>What your companion can do</h3>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Animations & moods</h3>
          <p className={styles.cardBody}>Idle, walking, sleeping, and reaction states driven by your activity.</p>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Voice conversation</h3>
          <p className={styles.cardBody}>Talk to it directly — press the Talk button on the overlay to start.</p>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Keyboard shortcuts</h3>
          <p className={styles.cardBody}>Treat, ball, spin, celebrate, and more — all reachable from your keyboard.</p>
        </div>
      </div>
    </div>
  );
}
