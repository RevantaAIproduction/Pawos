import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import type { SectionId } from './sections';
import { HomeIcon, CompanionIcon, HistoryIcon, WorkIcon } from './NavIcons';
import { ProfileMenu, type ProfileMenuAction } from './ProfileMenu';

const COLLAPSE_STORAGE_KEY = 'pawos.sidebarCollapsed';

function CollapseToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
      {collapsed ? <path d="M14 9.5 17 12l-3 2.5" /> : <path d="M16 9.5 13 12l3 2.5" />}
    </svg>
  );
}

type NavItem = { id: SectionId; label: string; icon: React.ReactNode };

const PRIMARY_NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
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

function NavButton({
  item,
  active,
  onSelect,
  badge,
  collapsed,
}: {
  item: NavItem;
  active: SectionId;
  onSelect: (id: SectionId) => void;
  badge?: React.ReactNode;
  collapsed: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ''}`}
      onClick={() => onSelect(item.id)}
      title={collapsed ? item.label : undefined}
    >
      <span className={styles.navIcon}>{item.icon}</span>
      {!collapsed && item.label}
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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // best-effort — a private/restricted profile just won't remember the preference
    }
  }, [collapsed]);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        {!collapsed && 'PawOS'}
        <button
          type="button"
          className={styles.sidebarCollapseButton}
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseToggleIcon collapsed={collapsed} />
        </button>
      </div>

      <nav className={styles.nav}>
        {PRIMARY_NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active}
            onSelect={onSelect}
            collapsed={collapsed}
            badge={
              item.id === 'companionLab' ? (
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
          <NavButton key={item.id} item={item} active={active} onSelect={onSelect} collapsed={collapsed} />
        ))}
      </nav>

      <div className={styles.navFooter}>
        <ProfileMenu
          userName={userName}
          tierLabel={tierLabel}
          isGuest={isGuest}
          onAction={onProfileAction}
          onOpenUrl={onOpenUrl}
          compact={collapsed}
        />
      </div>
    </aside>
  );
}
