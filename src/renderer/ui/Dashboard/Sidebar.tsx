import React from 'react';
import styles from './dashboard.module.css';
import type { SectionId } from './sections';

const NAV: { id: SectionId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'talk', label: 'Talk with Paw' },
  { id: 'companionLab', label: 'Companion Lab' },
  { id: 'history', label: 'Conversation History' },
  { id: 'workHistory', label: 'Work History' },
  { id: 'browserCapabilities', label: 'Browser Capabilities' },
  { id: 'communicationDrafts', label: 'Meeting Summaries' },
  { id: 'desktop', label: 'Desktop' },
];

const NAV_FOOTER: { id: SectionId; label: string }[] = [{ id: 'settings', label: 'Settings' }];

export function Sidebar({
  active,
  onSelect,
  userName,
  companionEnabled,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  userName: string;
  companionEnabled: boolean;
}) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        PawOS
      </div>

      <nav className={styles.nav}>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
            {item.id === 'talk' && (
              <span
                className={styles.statusDot}
                data-on={companionEnabled}
                title={companionEnabled ? 'Companion enabled' : 'Companion disabled'}
              />
            )}
          </button>
        ))}
      </nav>

      <div className={styles.navFooter}>
        {NAV_FOOTER.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
        <div className={styles.userChip}>
          <span className={styles.userAvatar}>{userName.slice(0, 1).toUpperCase()}</span>
          <span className={styles.userName}>{userName}</span>
        </div>
      </div>
    </aside>
  );
}
