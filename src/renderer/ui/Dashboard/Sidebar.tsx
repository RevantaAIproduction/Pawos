import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import type { SectionId } from './sections';
import { SECTION_TITLES } from './sections';
import { HomeIcon, CompanionIcon, WorkIcon } from './NavIcons';
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

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M11 18l-6-6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Real, searchable universe — every SectionId this shell can navigate to, not just the six
 *  visible primary/secondary nav items (Research/Communication/Office/Cloud/Development/Files
 *  live under Apps and have no direct sidebar entry otherwise). */
const SEARCHABLE_SECTIONS: { id: SectionId; label: string }[] = (Object.keys(SECTION_TITLES) as SectionId[]).map((id) => ({
  id,
  label: SECTION_TITLES[id],
}));

function SidebarSearch({ collapsed, onSelect }: { collapsed: boolean; onSelect: (id: SectionId) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCHABLE_SECTIONS.filter((s) => s.label.toLowerCase().includes(q));
  }, [query]);

  const choose = (id: SectionId) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  if (!open) {
    return (
      <button
        type="button"
        className={styles.sidebarToolbarButton}
        onClick={() => setOpen(true)}
        title="Search"
        aria-label="Search"
      >
        <SearchIcon />
        {!collapsed && <span>Search</span>}
      </button>
    );
  }

  return (
    <div className={styles.sidebarSearchWrap} ref={wrapRef}>
      <div className={styles.sidebarSearchInputRow}>
        <SearchIcon />
        <input
          ref={inputRef}
          className={styles.sidebarSearchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            } else if (e.key === 'Enter' && results[0]) {
              choose(results[0].id);
            }
          }}
          placeholder="Search..."
        />
      </div>
      {results.length > 0 && (
        <div className={styles.sidebarSearchResults}>
          {results.map((r) => (
            <button key={r.id} type="button" className={styles.sidebarSearchResult} onClick={() => choose(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  { id: 'workHistory', label: 'Working History', icon: <WorkIcon /> },
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
  onBack,
  canGoBack,
  userName,
  tierLabel,
  isGuest,
  companionEnabled,
  onProfileAction,
  onOpenUrl,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  /** Pops the real navigation history Dashboard.tsx tracks — disabled (not hidden) when empty, same convention as every other disabled-vs-hidden control in this app. */
  onBack: () => void;
  canGoBack: boolean;
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

      <div className={styles.sidebarToolbar}>
        <button
          type="button"
          className={styles.sidebarToolbarButton}
          onClick={onBack}
          disabled={!canGoBack}
          title="Back"
          aria-label="Back"
        >
          <BackIcon />
          {!collapsed && <span>Back</span>}
        </button>
        <SidebarSearch collapsed={collapsed} onSelect={onSelect} />
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
