export type SettingsState = {
  selectedPetId: string;
  animationSpeed: number;
  soundVolume: number;
  startWithWindows: boolean;
  enableKeyboardReactions: boolean;
  enableMouseReactions: boolean;
  muted: boolean;
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

