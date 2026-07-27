import React from 'react';
import styles from './dashboard.module.css';
import { ChevronRightIcon } from './NavIcons';

export interface SectionTileDef {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType;
  /** Optional small badge, e.g. a count — "3 pending". */
  badge?: string;
}

/**
 * A grid of clickable tiles replacing "every panel forced open, stacked top to bottom." Pick a
 * tile, see only that section, with a way back — the same pattern any real settings app (macOS
 * System Settings, Slack admin, Notion workspace settings) uses instead of one infinite scroll.
 */
export function SectionHub({ tiles, onSelect }: { tiles: SectionTileDef[]; onSelect: (id: string) => void }) {
  return (
    <div className={styles.sectionTileGrid}>
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" className={styles.sectionTile} onClick={() => onSelect(t.id)}>
            <span className={styles.sectionTileIcon}>
              <Icon />
            </span>
            <span className={styles.sectionTileBody}>
              <span className={styles.sectionTileTitleRow}>
                <span className={styles.sectionTileTitle}>{t.title}</span>
                {t.badge && <span className={styles.sectionTileBadge}>{t.badge}</span>}
              </span>
              <span className={styles.sectionTileDesc}>{t.description}</span>
            </span>
            <span className={styles.sectionTileChevron}>
              <ChevronRightIcon />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SectionDetail({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" className={styles.sectionBackButton} onClick={onBack}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
          <ChevronRightIcon />
        </span>
        Back
      </button>
      <h3 className={styles.sectionDetailTitle}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}
