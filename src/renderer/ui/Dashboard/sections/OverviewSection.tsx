import React from 'react';
import styles from '../dashboard.module.css';
import type { SectionId } from './index';

const CARDS: { title: string; body: string; goto?: SectionId }[] = [
  { title: "Today's overview", body: 'No activity yet — enable your companion to start building a history.' },
  { title: 'Companion status', body: 'Not enabled. Turn it on from Talk with Paw.', goto: 'talk' },
  { title: 'Companion Studio', body: 'Customize your companion, or upload a 3D model of your own.', goto: 'companionLab' },
  { title: 'Desktop actions', body: 'Open apps, websites, folders, or search files by hand right from here.', goto: 'desktop' },
  { title: 'System status', body: 'Running on local CPU rendering. All systems normal.' },
];

const QUICK_ACTIONS: { label: string; goto: SectionId }[] = [
  { label: 'Enable companion', goto: 'talk' },
  { label: 'Companion Studio', goto: 'companionLab' },
  { label: 'Desktop actions', goto: 'desktop' },
  { label: 'Settings', goto: 'settings' },
];

export function OverviewSection({ onNavigate }: { onNavigate: (id: SectionId) => void }) {
  return (
    <div>
      <div className={styles.grid}>
        {CARDS.map((card) => (
          <div
            key={card.title}
            className={styles.card}
            onClick={card.goto ? () => onNavigate(card.goto!) : undefined}
            style={card.goto ? { cursor: 'pointer' } : undefined}
          >
            <h3 className={styles.cardTitle}>{card.title}</h3>
            <p className={styles.cardBody}>{card.body}</p>
          </div>
        ))}
      </div>

      <h3 className={styles.subheading}>Quick actions</h3>
      <div className={styles.quickActions}>
        {QUICK_ACTIONS.map((action) => (
          <button key={action.label} type="button" className={styles.chip} onClick={() => onNavigate(action.goto)}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
