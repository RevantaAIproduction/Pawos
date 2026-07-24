import React from 'react';
import styles from './dashboard.module.css';
import type { SectionId } from './sections';
import { HomeIcon, TalkIcon, CompanionIcon, HistoryIcon, WorkIcon } from './NavIcons';
import { ProfileMenu, type ProfileMenuAction } from './ProfileMenu';

type NavItem = { id: SectionId; label: string; icon: React.ReactNode };

const PRIMARY_NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'talk', label: 'Talk with Paw', icon: <TalkIcon /> },
  { id: 'companionLab', label: 'Companion Studio', icon: <CompanionIcon /> },
  { id: 'projects', label: 'Projects', icon: <WorkIcon /> },
  { id: 'apps', label: 'Apps', icon: <AppsGridIcon /> },
  { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
];

const SECONDARY_NAV: NavItem[] = [
  { id: 'workHistory', label: 'Work History', icon: <WorkIcon /> },
  { id: 'history', label: 'Conversation History', icon: <HistoryIcon /> },
];

function AppsGridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 19.5v-6M12 19.5v-11M19.5 19.5V9" />
    </svg>
  );
}

function NavButton({ item, active, onSelect, badge }: { item: NavItem; active: SectionId; onSelect: (id: SectionId) => void; badge?: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ''}`}
      onClick={() => onSelect(item.id)}
    >
      <span className={styles.navIcon}>{item.icon}</span>
      {item.label}
      {badge}
    </button>
  );
}

export function Sidebar({
  active,
  onSelect,
  userName,
  tierLabel,
  isGuest,
  companionEnabled,
  onProfileAction,
  onOpenUrl,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  userName: string;
  tierLabel: string;
  isGuest: boolean;
  companionEnabled: boolean;
  onProfileAction: (action: ProfileMenuAction) => void;
  onOpenUrl: (url: string) => void;
}) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        PawOS
      </div>

      <nav className={styles.nav}>
        {PRIMARY_NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active}
            onSelect={onSelect}
            badge={
              item.id === 'talk' ? (
                <span
                  className={styles.statusDot}
                  data-on={companionEnabled}
                  title={companionEnabled ? 'Companion enabled' : 'Companion disabled'}
                />
              ) : undefined
            }
          />
        ))}

        <div className={styles.navDivider} />

        {SECONDARY_NAV.map((item) => (
          <NavButton key={item.id} item={item} active={active} onSelect={onSelect} />
        ))}
      </nav>

      <div className={styles.navFooter}>
        <ProfileMenu
          userName={userName}
          tierLabel={tierLabel}
          isGuest={isGuest}
          onAction={onProfileAction}
          onOpenUrl={onOpenUrl}
        />
      </div>
    </aside>
  );
}
