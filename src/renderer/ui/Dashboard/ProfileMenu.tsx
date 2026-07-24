import React, { useEffect, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import { SettingsIcon, LanguageIcon, HelpIcon, InfoIcon, ChevronRightIcon } from './NavIcons';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

export type ProfileMenuAction = 'settings' | 'upgrade' | 'logout';

/**
 * Real, usable languages — each is a genuine BCP-47 code passed straight to
 * the Web Speech API for push-to-talk speech recognition (see
 * SpeechProviders.ts), persisted via Settings so it survives a restart.
 * This governs speech-to-text language only, not full UI translation
 * (PawOS has no i18n string system yet — every label you see stays
 * English regardless of this setting).
 */
const LANGUAGES: { label: string; code: string }[] = [
  { label: 'English (United States)', code: 'en-US' },
  { label: 'Français (France)', code: 'fr-FR' },
  { label: 'Deutsch (Deutschland)', code: 'de-DE' },
  { label: 'हिन्दी (भारत)', code: 'hi-IN' },
  { label: 'Español (España)', code: 'es-ES' },
  { label: '日本語 (日本)', code: 'ja-JP' },
];

const LEARN_MORE_LINKS = [
  { label: 'About PawOS', url: 'https://revantaai.com/about' },
  { label: 'Documentation', url: 'https://revantaai.com/docs' },
  { label: 'Privacy Policy', url: 'https://revantaai.com/privacy' },
  { label: 'Terms of Service', url: 'https://revantaai.com/terms' },
];

type PanelView = 'main' | 'language' | 'learnMore' | 'help';

/**
 * Bottom-of-sidebar account control, behaving like a desktop app's account
 * menu: Settings, Language, Get help, and Learn more each open their own
 * sub-view within the same popover; Upgrade plan / Log out act immediately.
 * Guests never see a purchased tier or "Upgrade plan" — they haven't
 * created an account yet, so the CTA is "Create free account" instead.
 */
export function ProfileMenu({
  userName,
  tierLabel,
  isGuest,
  onAction,
  onOpenUrl,
}: {
  userName: string;
  tierLabel: string;
  isGuest: boolean;
  onAction: (action: ProfileMenuAction) => void;
  onOpenUrl: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView>('main');
  const [languageCode, setLanguageCode] = useState(LANGUAGES[0]?.code ?? 'en-US');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipc.settingsGet().then((s) => setLanguageCode(s.speechLanguage)).catch(() => {});
  }, []);

  function selectLanguage(code: string) {
    setLanguageCode(code);
    ipc.settingsSet({ speechLanguage: code }).catch(() => {});
    // Lets useConversationController re-point the live speech-recognition
    // provider immediately, same lightweight window-event pattern used
    // elsewhere for cross-component notifications without a new IPC channel.
    window.dispatchEvent(new CustomEvent('pawos-speech-language-changed', { detail: code }));
  }

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView('main');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    setView('main');
  };

  const initial = userName.slice(0, 1).toUpperCase();

  return (
    <div className={styles.profileMenuRoot} ref={rootRef}>
      {open && (
        <div className={styles.profileMenuPanel} role="menu">
          {view === 'main' && (
            <>
              <div className={styles.profileMenuHeader}>
                <span className={styles.userAvatar}>{initial}</span>
                <div>
                  <div className={styles.userName}>{userName}</div>
                  <div className={styles.profileMenuTier}>{isGuest ? 'Guest — preview session' : tierLabel}</div>
                </div>
              </div>
              <div className={styles.profileMenuDivider} />

              <button type="button" role="menuitem" className={styles.profileMenuItem} onClick={() => { close(); onAction('settings'); }}>
                <span className={styles.profileMenuItemIcon}><SettingsIcon /></span>
                Settings
              </button>
              <button type="button" role="menuitem" className={styles.profileMenuItem} onClick={() => setView('language')}>
                <span className={styles.profileMenuItemIcon}><LanguageIcon /></span>
                Language
                <span className={styles.profileMenuItemChevron}><ChevronRightIcon /></span>
              </button>
              <button type="button" role="menuitem" className={styles.profileMenuItem} onClick={() => setView('help')}>
                <span className={styles.profileMenuItemIcon}><HelpIcon /></span>
                Get help
                <span className={styles.profileMenuItemChevron}><ChevronRightIcon /></span>
              </button>

              <div className={styles.profileMenuDivider} />
              <button type="button" role="menuitem" className={styles.profileMenuItem} onClick={() => { close(); onAction('upgrade'); }}>
                {isGuest ? 'Create free account' : 'Upgrade plan'}
              </button>
              <button type="button" role="menuitem" className={styles.profileMenuItem} onClick={() => setView('learnMore')}>
                <span className={styles.profileMenuItemIcon}><InfoIcon /></span>
                Learn more
                <span className={styles.profileMenuItemChevron}><ChevronRightIcon /></span>
              </button>

              <div className={styles.profileMenuDivider} />
              <button type="button" role="menuitem" className={styles.profileMenuItemDanger} onClick={() => { close(); onAction('logout'); }}>
                {isGuest ? 'End guest session' : 'Log out'}
              </button>
            </>
          )}

          {view === 'language' && (
            <>
              <button type="button" className={styles.profileMenuBack} onClick={() => setView('main')}>
                ‹ Language
              </button>
              <div className={styles.profileMenuDivider} />
              <p className={styles.profileMenuHelpBody}>Used for push-to-talk speech recognition.</p>
              {LANGUAGES.map((lng) => (
                <button
                  key={lng.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={languageCode === lng.code}
                  className={styles.profileMenuItem}
                  onClick={() => selectLanguage(lng.code)}
                >
                  {lng.label}
                  {languageCode === lng.code ? ' ✓' : ''}
                </button>
              ))}
            </>
          )}

          {view === 'help' && (
            <>
              <button type="button" className={styles.profileMenuBack} onClick={() => setView('main')}>
                ‹ Get help
              </button>
              <div className={styles.profileMenuDivider} />
              <p className={styles.profileMenuHelpBody}>
                Need a hand with PawOS? Browse the documentation or reach out — we read every
                message.
              </p>
              <button
                type="button"
                className={styles.profileMenuItem}
                onClick={() => { close(); onOpenUrl('https://revantaai.com/docs'); }}
              >
                Documentation
              </button>
              <button
                type="button"
                className={styles.profileMenuItem}
                onClick={() => { close(); onOpenUrl('mailto:support@revantaai.com'); }}
              >
                Contact support
              </button>
            </>
          )}

          {view === 'learnMore' && (
            <>
              <button type="button" className={styles.profileMenuBack} onClick={() => setView('main')}>
                ‹ Learn more
              </button>
              <div className={styles.profileMenuDivider} />
              {LEARN_MORE_LINKS.map((link) => (
                <button
                  key={link.url}
                  type="button"
                  className={styles.profileMenuItem}
                  onClick={() => { close(); onOpenUrl(link.url); }}
                >
                  {link.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <button type="button" className={styles.userChip} onClick={() => setOpen((v) => !v)}>
        <span className={styles.userAvatar}>{initial}</span>
        <div style={{ minWidth: 0 }}>
          <div className={styles.userName}>{userName}</div>
          <div className={styles.profileMenuTierInline}>{isGuest ? 'Guest' : tierLabel}</div>
        </div>
      </button>
    </div>
  );
}
