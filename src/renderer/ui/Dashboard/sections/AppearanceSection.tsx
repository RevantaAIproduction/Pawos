import React from 'react';
import styles from '../dashboard.module.css';
import { SkinManagerPanel } from './SkinManagerPanel';
import { CompanionBehaviorSection } from './CompanionBehaviorSection';
import { PerformanceSection } from './PerformanceSection';

/**
 * Preferences → Appearance is companion visual customization (skins,
 * accessories, desktop-reaction behavior, animation speed) — distinct from
 * Preferences → Theme, which is the app-wide dark/light chrome.
 */
export function AppearanceSection({ onOpenCompanionStudio }: { onOpenCompanionStudio: () => void }) {
  return (
    <div>
      <p className={styles.cardBody} style={{ marginBottom: 14 }}>
        Customize your companion's look — skins, accessories, and poses.
      </p>
      <SkinManagerPanel />
      <div style={{ marginTop: 14 }}>
        <CompanionBehaviorSection onOpenCompanionStudio={onOpenCompanionStudio} />
      </div>
      <div style={{ marginTop: 14 }}>
        <PerformanceSection />
      </div>
    </div>
  );
}
