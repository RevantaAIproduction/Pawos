import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SettingsStore, SETTINGS_FILE } from './SettingsStore';
import { DEFAULT_SETTINGS } from '../../renderer/services/settings/SettingsManager';

let root: string;
let userData: string;
let legacyDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-settings-'));
  userData = path.join(root, 'userData');
  legacyDir = path.join(root, 'install');
  fs.mkdirSync(legacyDir, { recursive: true });
  SettingsStore.resetForTests();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  SettingsStore.resetForTests();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('persists to <storageDir>/pawos-settings.json (creating userData) and survives a restart', () => {
    SettingsStore.init({ storageDir: userData });
    SettingsStore.update({ startWithWindows: false });
    expect(SettingsStore.getStoragePath()).toBe(path.join(userData, SETTINGS_FILE));
    expect(JSON.parse(fs.readFileSync(path.join(userData, SETTINGS_FILE), 'utf8')).startWithWindows).toBe(false);

    // "Restart": a fresh process loads the saved value, not the default.
    SettingsStore.resetForTests();
    SettingsStore.init({ storageDir: userData });
    expect(SettingsStore.getState().startWithWindows).toBe(false);
    expect(DEFAULT_SETTINGS.startWithWindows).toBe(true);
  });

  it('never writes to the working directory', () => {
    const cwdFile = path.join(process.cwd(), SETTINGS_FILE);
    const before = fs.existsSync(cwdFile) ? fs.statSync(cwdFile).mtimeMs : null;
    SettingsStore.init({ storageDir: userData });
    SettingsStore.update({ themeMode: 'light' });
    const after = fs.existsSync(cwdFile) ? fs.statSync(cwdFile).mtimeMs : null;
    expect(after).toBe(before);
  });

  it('before init(): returns defaults, keeps updates in memory, and does not fix a location', () => {
    expect(SettingsStore.getStoragePath()).toBeNull();
    expect(SettingsStore.getState().startWithWindows).toBe(DEFAULT_SETTINGS.startWithWindows);
    SettingsStore.update({ startWithWindows: false });
    expect(SettingsStore.getStoragePath()).toBeNull();
    // A later init() still binds to userData and loads what's there.
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, SETTINGS_FILE), JSON.stringify({ ...DEFAULT_SETTINGS, speechLanguage: 'fr-FR' }));
    SettingsStore.init({ storageDir: userData });
    expect(SettingsStore.getStoragePath()).toBe(path.join(userData, SETTINGS_FILE));
    expect(SettingsStore.getState().speechLanguage).toBe('fr-FR');
  });

  it('carries a legacy settings file (install/working dir) over once, and prefers an existing userData file', () => {
    fs.writeFileSync(path.join(legacyDir, SETTINGS_FILE), JSON.stringify({ ...DEFAULT_SETTINGS, startWithWindows: false }));
    SettingsStore.init({ storageDir: userData, legacyDirs: [legacyDir] });
    expect(SettingsStore.getState().startWithWindows).toBe(false);
    expect(fs.existsSync(path.join(userData, SETTINGS_FILE))).toBe(true);

    // userData now wins over a (different) legacy file.
    fs.writeFileSync(path.join(legacyDir, SETTINGS_FILE), JSON.stringify({ ...DEFAULT_SETTINGS, startWithWindows: true }));
    SettingsStore.resetForTests();
    SettingsStore.init({ storageDir: userData, legacyDirs: [legacyDir] });
    expect(SettingsStore.getState().startWithWindows).toBe(false);
  });

  it('ignores an unreadable/corrupt legacy file and a missing legacy dir', () => {
    fs.writeFileSync(path.join(legacyDir, SETTINGS_FILE), '{ not json');
    SettingsStore.init({ storageDir: userData, legacyDirs: [path.join(root, 'nope'), legacyDir] });
    expect(SettingsStore.getState()).toEqual(DEFAULT_SETTINGS);
    expect(fs.existsSync(path.join(userData, SETTINGS_FILE))).toBe(false);
  });

  it('logs (instead of swallowing) a failed write', () => {
    const blocked = path.join(root, 'blocked-file');
    fs.writeFileSync(blocked, 'not a directory');
    SettingsStore.init({ storageDir: blocked });
    SettingsStore.update({ startWithWindows: false });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('could not save settings'), expect.anything());
  });
});
