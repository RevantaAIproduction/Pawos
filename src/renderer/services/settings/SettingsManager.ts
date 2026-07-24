export type ThemeMode = 'dark' | 'light' | 'system';

export type SettingsState = {
  selectedPetId: string;
  animationSpeed: number;
  soundVolume: number;
  startWithWindows: boolean;
  enableKeyboardReactions: boolean;
  enableMouseReactions: boolean;
  muted: boolean;
  /** Desktop notification when a task finishes while the window isn't focused — see CompanionExperience.tsx. */
  notifyOnTaskComplete: boolean;
  /** App-wide chrome theme — see theme.css and AppRoot.tsx's theme-sync effect. */
  themeMode: ThemeMode;
  /** BCP-47 code (e.g. 'en-US', 'fr-FR') for push-to-talk speech recognition — see SpeechProviders.ts. Set from the profile menu's Language picker. */
  speechLanguage: string;
};

export type SettingsPatch = Partial<SettingsState>;

export const DEFAULT_SETTINGS: SettingsState = {
  selectedPetId: 'cat',
  animationSpeed: 1,
  soundVolume: 0.6,
  startWithWindows: true,
  enableKeyboardReactions: true,
  enableMouseReactions: true,
  muted: false,
  notifyOnTaskComplete: true,
  themeMode: 'dark',
  speechLanguage: 'en-US',
};

export class SettingsManager {
  private state: SettingsState = DEFAULT_SETTINGS;

  getState(): SettingsState {
    return this.state;
  }

  update(patch: SettingsPatch) {
    this.state = { ...this.state, ...patch };
  }
}

