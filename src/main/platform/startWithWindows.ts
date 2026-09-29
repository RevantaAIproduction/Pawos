import { WINDOWS_STARTUP_SETTINGS_URI } from './storeRuntime';
import { isStartupTaskOn, type StoreStartupTaskApi } from './storeStartupTask';

export interface StartWithWindowsDeps {
  isStore: boolean;
  /** Electron's app.setLoginItemSettings — direct-download (NSIS) builds only. */
  setLoginItemSettings: (settings: { openAtLogin: boolean; path: string }) => void;
  exePath: string;
  storeTask: StoreStartupTaskApi;
  openExternal: (url: string) => Promise<void>;
  /** Store build diagnostics (persisted, since a packaged app's console output is lost). */
  log?: (line: string) => void;
}

/** What the Settings toggle should show. */
export interface StartWithWindowsStatus {
  /** true for the Microsoft Store build: Windows Settings > Apps > Startup controls it. */
  managedByWindows: boolean;
  /** Store build: whether Windows will start PawOS (null if unknown). Direct build: null (use the saved preference). */
  enabled: boolean | null;
}

/**
 * Applies the Settings > Preferences > General "Start PawOS when Windows starts" preference.
 *
 * - Direct download (NSIS): HKCU Run key via app.setLoginItemSettings — unchanged.
 * - Microsoft Store (MSIX): startup is the package's StartupTask (PawOSStartup), which only
 *   Windows can switch for this app (see storeStartupTask.ts). Launching PawOS never changes it;
 *   when the user changes the toggle and Windows' state differs, Windows Settings > Apps > Startup
 *   opens so they can switch PawOS there.
 */
export async function applyStartWithWindows(
  enabled: boolean,
  deps: StartWithWindowsDeps,
  opts: { userInitiated: boolean }
): Promise<void> {
  if (!deps.isStore) {
    deps.setLoginItemSettings({ openAtLogin: enabled, path: deps.exePath });
    return;
  }
  const log = deps.log ?? (() => undefined);
  const source = opts.userInitiated ? 'toggle' : 'launch';
  try {
    const state = await deps.storeTask.getState();
    log(`${source}: preference=${enabled ? 'on' : 'off'} windows=${state ?? 'unknown'}`);
    if (!opts.userInitiated) return;
    if (state !== null && isStartupTaskOn(state) === enabled) return;
    log(`${source}: opening Windows Startup settings`);
    await deps.openExternal(WINDOWS_STARTUP_SETTINGS_URI);
  } catch (e) {
    log(`${source}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function getStartWithWindowsStatus(deps: Pick<StartWithWindowsDeps, 'isStore' | 'storeTask'>): Promise<StartWithWindowsStatus> {
  if (!deps.isStore) return { managedByWindows: false, enabled: null };
  const state = await deps.storeTask.getState();
  return { managedByWindows: true, enabled: state === null ? null : isStartupTaskOn(state) };
}
