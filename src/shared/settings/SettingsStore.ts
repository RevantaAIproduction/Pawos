import type { SettingsPatch, SettingsState } from '../../../src/renderer/services/settings/SettingsManager';
import { DEFAULT_SETTINGS } from '../../../src/renderer/services/settings/SettingsManager';

const STORAGE_FILE = 'pawos-settings.json';
const DEFAULT_STORAGE_DIR = '.';

function readJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Filesystem-only persistence suitable for Electron main.
export class SettingsStore {
  private static state: SettingsState = DEFAULT_SETTINGS;
  private static inited = false;
  private static storageDir = DEFAULT_STORAGE_DIR;

  static init(opts?: { storageDir?: string }) {
    if (this.inited) return;
    this.inited = true;

    // Lazily require fs to keep this module environment-friendly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');

    if (opts?.storageDir) this.storageDir = opts.storageDir;

    const fullPath = `${this.storageDir}/${STORAGE_FILE}`;
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const persisted = readJsonSafe<SettingsState>(raw);
      if (persisted) this.state = { ...DEFAULT_SETTINGS, ...persisted };
    } catch {
      // First run: create file on first update.
    }
  }

  static getState(): SettingsState {
    this.init();
    return this.state;
  }

  static update(partial: SettingsPatch) {
    this.init();
    this.state = { ...this.state, ...partial };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const fullPath = `${this.storageDir}/${STORAGE_FILE}`;
    try {
      fs.writeFileSync(fullPath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Ignore persistence errors in recovery scenarios.
    }
  }
}

