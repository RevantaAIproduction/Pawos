import React from 'react';
import styles from '../dashboard.module.css';
import type { SectionId } from './index';
import type { FeatureId } from '../../../../shared/billing/BillingTypes';
import { DevelopmentIcon, BrowserIcon, CommunicationIcon, OfficeIcon, CloudIcon, DesktopIcon } from '../NavIcons';

const APP_TILES: { id: SectionId; label: string; body: string; icon: React.ReactNode }[] = [
  { id: 'development', label: 'Development', body: 'Clone repos, generate and edit code, run builds and tests.', icon: <DevelopmentIcon /> },
  { id: 'browserCapabilities', label: 'Research', body: 'Browse, search, and compare information across the web.', icon: <BrowserIcon /> },
  { id: 'communicationDrafts', label: 'Communication', body: 'Meeting summaries, action items, and follow-up drafts.', icon: <CommunicationIcon /> },
  { id: 'office', label: 'Office', body: 'Create and edit documents, spreadsheets, and presentations.', icon: <OfficeIcon /> },
  { id: 'infrastructure', label: 'Cloud', body: 'Deploy, investigate, and manage your infrastructure.', icon: <CloudIcon /> },
  { id: 'desktop', label: 'Files', body: 'Open apps and websites, browse folders, search files.', icon: <DesktopIcon /> },
];

/**
 * Apps is the one place runtimes surface — reframed as workflows a person
 * recognizes, never by their internal names. Automation has no backend yet
 * (no workflow/scheduling engine exists) so it's shown honestly disabled
 * rather than wired to nothing.
 */
/** Career tools — shown only to accounts whose plan includes them (PawOS Build). */
const CAREER_FEATURES: FeatureId[] = ['atsScoring', 'resumeRewriting', 'resumeGeneration', 'jobSearch'];

function CareerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
    </svg>
  );
}

export function AppsHubSection({ onNavigate, features }: { onNavigate: (id: SectionId) => void; features: readonly FeatureId[] }) {
  const showCareer = CAREER_FEATURES.some((f) => features.includes(f));
  return (
    <div>
      <div className={styles.grid}>
        {showCareer && (
          <div className={styles.card} style={{ cursor: 'pointer' }} onClick={() => onNavigate('career')} data-testid="apps-career-tile">
            <div className={styles.appTileIcon}>
              <CareerIcon />
            </div>
            <h3 className={styles.cardTitle}>Career</h3>
            <p className={styles.cardBody}>Score your resume for ATS, rewrite or create it, and plan your job search.</p>
          </div>
        )}
        {APP_TILES.map((tile) => (
          <div key={tile.id} className={styles.card} style={{ cursor: 'pointer' }} onClick={() => onNavigate(tile.id)}>
            <div className={styles.appTileIcon}>{tile.icon}</div>
            <h3 className={styles.cardTitle}>{tile.label}</h3>
            <p className={styles.cardBody}>{tile.body}</p>
          </div>
        ))}
        <div className={styles.card} style={{ opacity: 0.5 }}>
          <div className={styles.appTileIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Automation</h3>
          <p className={styles.cardBody}>Scheduled and triggered workflows. Not available yet.</p>
        </div>
      </div>
    </div>
  );
}
