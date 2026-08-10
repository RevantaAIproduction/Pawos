import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';
import type { ThemeMode } from '../../../services/ipc/ipcTypes';
import { Toggle } from '../Toggle';
import { LANGUAGES } from '../languages';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/** A tiny visual stand-in for what each theme actually looks like, not just its name. */
function ThemeSwatchPreview({ mode }: { mode: ThemeMode }) {
  if (mode === 'system') {
    return (
      <div className={styles.themeSwatchPreview} style={{ flexDirection: 'row' }}>
        <div style={{ flex: 1, background: '#15161a' }} />
        <div style={{ flex: 1, background: '#f4f5f7' }} />
      </div>
    );
  }
  const dark = mode === 'dark';
  const bg = dark ? '#15161a' : '#f4f5f7';
  const bar = dark ? '#1f2025' : '#ffffff';
  const line = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  const accent = dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.22)';
  return (
    <div className={styles.themeSwatchPreview} style={{ background: bg }}>
      <div className={styles.themeSwatchBar} style={{ background: bar }} />
      <div className={styles.themeSwatchBody}>
        <div className={styles.themeSwatchLine} style={{ width: 10, height: '100%', background: accent }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
          <div className={styles.themeSwatchLine} style={{ width: '70%', height: 4, background: line }} />
          <div className={styles.themeSwatchLine} style={{ width: '45%', height: 4, background: line }} />
        </div>
      </div>
    </div>
  );
}

/** General preferences: startup, appearance/theme, and language — the everyday app-wide settings live here as one tab. */
export function GeneralSection() {
  const [settings, setSettingsState] = useState<SettingsState | null>(null);
  const [version, setVersion] = useState('…');

  useEffect(() => {
    ipc.settingsGet().then(setSettingsState).catch(() => {});
    ipc.systemGetAppVersion().then(setVersion).catch(() => {});
  }, []);

  const toggleStartWithWindows = async (checked: boolean) => {
    setSettingsState((s) => (s ? { ...s, startWithWindows: checked } : s));
    await ipc.settingsSet({ startWithWindows: checked });
  };

  const setThemeMode = async (themeMode: ThemeMode) => {
    setSettingsState((s) => (s ? { ...s, themeMode } : s));
    await ipc.settingsSet({ themeMode });
  };

  const selectLanguage = async (code: string) => {
    setSettingsState((s) => (s ? { ...s, speechLanguage: code } : s));
    await ipc.settingsSet({ speechLanguage: code });
    // Lets useConversationController re-point the live speech-recognition
    // provider immediately, same lightweight window-event pattern used
    // elsewhere for cross-component notifications without a new IPC channel.
    window.dispatchEvent(new CustomEvent('pawos-speech-language-changed', { detail: code }));
  };

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Startup</h3>
        <label className={styles.settingsToggleRow}>
          <span>Start PawOS when Windows starts</span>
          <Toggle checked={settings?.startWithWindows ?? true} onChange={toggleStartWithWindows} />
        </label>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Appearance</h3>
        <p className={styles.cardBody} style={{ marginBottom: 12 }}>
          Applied live across PawOS — pick the look you want.
        </p>
        <div className={styles.themeSwatchRow}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.themeSwatchCard} ${settings?.themeMode === opt.value ? styles.themeSwatchCardActive : ''}`}
              onClick={() => setThemeMode(opt.value)}
            >
              <ThemeSwatchPreview mode={opt.value} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Language</h3>
        <p className={styles.cardBody} style={{ marginBottom: 12 }}>
          Used for push-to-talk speech recognition.
        </p>
        <div className={styles.quickActions}>
          {LANGUAGES.map((lng) => (
            <button
              key={lng.code}
              type="button"
              className={`${styles.chip} ${settings?.speechLanguage === lng.code ? styles.chipActive : ''}`}
              onClick={() => selectLanguage(lng.code)}
            >
              {lng.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>About</h3>
        <p className={styles.cardBody}>PawOS version {version}</p>
      </div>
    </div>
  );
}
