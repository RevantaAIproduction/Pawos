import type { SettingsPatch, SettingsState } from '../../../src/renderer/services/settings/SettingsManager';
import { DEFAULT_SETTINGS } from '../../../src/renderer/services/settings/SettingsManager';

export const SETTINGS_FILE = 'pawos-settings.json';

function readJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Lazily required so this module stays environment-friendly.
function nodeFs(): typeof import('fs') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('fs') as typeof import('fs');
}
function nodePath(): typeof import('path') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('path') as typeof import('path');
}

/**
 * Filesystem persistence for Electron main.
 *
 * Settings live in the directory passed to init() — main.ts passes app.getPath('userData'),
 * which is writable in every build (NSIS, Microsoft Store/MSIX, dev). There is deliberately no
 * working-directory default: a packaged app's working directory is often unwritable
 * (C:\Windows\System32 or the read-only WindowsApps folder for MSIX), which silently lost every
 * setting. Until init() runs, getState() returns the defaults without fixing a location.
 */
export class SettingsStore {
  private static state: SettingsState = { ...DEFAULT_SETTINGS };
  private static storageDir: string | null = null;

  /**
   * Loads settings from `<storageDir>/pawos-settings.json`. On first use of a storage dir, a
   * settings file left by older builds in one of `legacyDirs` (install dir / working dir) is
   * copied over once so existing preferences aren't lost. Only the first call has an effect.
   */
  static init(opts: { storageDir: string; legacyDirs?: string[] }) {
    if (this.storageDir) return;
    const fs = nodeFs();
    const path = nodePath();
    this.storageDir = opts.storageDir;
    const fullPath = path.join(this.storageDir, SETTINGS_FILE);

    let raw: string | null = null;
    try {
      raw = fs.readFileSync(fullPath, 'utf8');
    } catch {
      raw = this.migrateLegacyFile(fullPath, opts.legacyDirs ?? []);
    }
    const persisted = readJsonSafe<SettingsState>(raw);
    if (persisted) this.state = { ...DEFAULT_SETTINGS, ...persisted };
  }

  /** Where settings are persisted, or null before init(). */
  static getStoragePath(): string | null {
    return this.storageDir ? nodePath().join(this.storageDir, SETTINGS_FILE) : null;
  }

  static getState(): SettingsState {
    return this.state;
  }

  static update(partial: SettingsPatch) {
    this.state = { ...this.state, ...partial };
    const fullPath = this.getStoragePath();
    if (!fullPath) {
      console.error('[settings] update() before SettingsStore.init() — change kept in memory only, not persisted');
      return;
    }
    try {
      nodeFs().mkdirSync(this.storageDir!, { recursive: true });
      nodeFs().writeFileSync(fullPath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error(`[settings] could not save settings to ${fullPath}:`, e instanceof Error ? e.message : e);
    }
  }

  private static migrateLegacyFile(targetPath: string, legacyDirs: string[]): string | null {
    const fs = nodeFs();
    const path = nodePath();
    for (const dir of legacyDirs) {
      const legacyPath = path.join(dir, SETTINGS_FILE);
      if (path.resolve(legacyPath) === path.resolve(targetPath)) continue;
      let raw: string;
      try {
        raw = fs.readFileSync(legacyPath, 'utf8');
      } catch {
        continue;
      }
      if (!readJsonSafe<SettingsState>(raw)) continue;
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, raw, 'utf8');
        console.error(`[settings] migrated settings from ${legacyPath} to ${targetPath}`);
      } catch (e) {
        console.error(`[settings] could not migrate settings from ${legacyPath}:`, e instanceof Error ? e.message : e);
      }
      return raw;
    }
    return null;
  }

  /** Test-only: forget the storage location and loaded state. */
  static resetForTests() {
    this.storageDir = null;
    this.state = { ...DEFAULT_SETTINGS };
  }
}
