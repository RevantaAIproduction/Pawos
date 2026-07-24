import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { GeneralSection } from './GeneralSection';
import { ThemeSection } from './ThemeSection';
import { AppearanceSection } from './AppearanceSection';
import { VoicePreferencesSection } from './VoicePreferencesSection';
import { NotificationsSection } from './NotificationsSection';

const PREFERENCE_TABS = ['General', 'Theme', 'Appearance', 'Voice', 'Notifications'] as const;
type PreferenceTab = (typeof PREFERENCE_TABS)[number];

/** Preferences tab: a small internal tab row over General/Theme/Appearance/Voice/Notifications — mirrors how Settings itself is a nav over top-level tabs. */
export function PreferencesSettingsPage({ onOpenCompanionStudio }: { onOpenCompanionStudio: () => void }) {
  const [tab, setTab] = useState<PreferenceTab>('General');

  return (
    <div>
      <div className={styles.tabRow}>
        {PREFERENCE_TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={t === tab ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'General' && <GeneralSection />}
      {tab === 'Theme' && <ThemeSection />}
      {tab === 'Appearance' && <AppearanceSection onOpenCompanionStudio={onOpenCompanionStudio} />}
      {tab === 'Voice' && <VoicePreferencesSection onOpenCompanionStudio={onOpenCompanionStudio} />}
      {tab === 'Notifications' && <NotificationsSection />}
    </div>
  );
}
