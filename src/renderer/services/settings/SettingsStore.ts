import type { SettingsState, SettingsPatch } from './SettingsManager';
import { DEFAULT_SETTINGS } from './SettingsManager';

const STORAGE_KEY = 'pawos:settings';

function readJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class SettingsStore {
  private static state: SettingsState = DEFAULT_SETTINGS;
  private static inited = false;

  static init() {
    if (this.inited) return;
    this.inited = true;

    const inRenderer = typeof window !== 'undefined';
    if (inRenderer) {
      const persisted = readJsonSafe<SettingsState>(window.localStorage.getItem(STORAGE_KEY));
      if (persisted) this.state = { ...DEFAULT_SETTINGS, ...persisted };
    }
  }

  static getState(): SettingsState {
    this.init();
    return this.state;
  }

  static update(patch: SettingsPatch) {
    this.init();
    this.state = { ...this.state, ...patch };

    const inRenderer = typeof window !== 'undefined';
    if (inRenderer) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }
  }
}

