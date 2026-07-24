import React from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';

export type RuntimeCapability = { title: string; body: string };
export type RuntimeQuickStart = { label: string; prefill: string };

/**
 * Shared landing page for a runtime that doesn't have a dedicated
 * hands-on UI in the Dashboard (Office, Cloud, Development) — explains
 * what it does and gives real quick-start actions instead of an empty
 * screen. "Quick start" opens the companion's conversation panel with the
 * prompt pre-filled and sent (via the existing cross-window
 * companion:command channel — see CompanionCommand.ts's 'openConversation'
 * case) rather than faking an interaction that doesn't exist.
 */
export function RuntimeLandingSection({
  icon,
  description,
  capabilities,
  quickStarts,
}: {
  icon: React.ReactNode;
  description: string;
  capabilities: RuntimeCapability[];
  quickStarts: RuntimeQuickStart[];
}) {
  const ipc = useIpcBridge();

  const runQuickStart = (prefill: string) => {
    ipc.sendCompanionCommand({ type: 'openConversation', prefill });
  };

  return (
    <div>
      <div className={styles.runtimeHero}>
        <div className={styles.runtimeHeroIcon}>{icon}</div>
        <p className={styles.runtimeHeroBody}>{description}</p>
      </div>

      <h3 className={styles.subheading}>What it can do</h3>
      <div className={styles.grid}>
        {capabilities.map((cap) => (
          <div key={cap.title} className={styles.card}>
            <h3 className={styles.cardTitle}>{cap.title}</h3>
            <p className={styles.cardBody}>{cap.body}</p>
          </div>
        ))}
      </div>

      <h3 className={styles.subheading}>Quick start — talk to Paw</h3>
      <div className={styles.quickStartRow}>
        {quickStarts.map((qs) => (
          <button key={qs.label} type="button" className={styles.chip} onClick={() => runQuickStart(qs.prefill)}>
            {qs.label}
          </button>
        ))}
      </div>
    </div>
  );
}
