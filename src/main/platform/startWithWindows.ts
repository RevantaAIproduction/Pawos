import { WINDOWS_STARTUP_SETTINGS_URI } from './storeRuntime';
import type { StoreStartupTaskApi } from './storeStartupTask';

export interface StartWithWindowsDeps {
  isStore: boolean;
  /** Electron's app.setLoginItemSettings — direct-download (NSIS) builds only. */
  setLoginItemSettings: (settings: { openAtLogin: boolean; path: string }) => void;
  exePath: string;
  storeTask: StoreStartupTaskApi;
  openExternal: (url: string) => Promise<void>;
}

/**
 * Applies the Settings > General "Start with Windows" preference.
 *
 * - Direct download (NSIS): HKCU Run key via app.setLoginItemSettings — unchanged.
 * - Microsoft Store (MSIX): packaged apps can't use the Run key; the package's
 *   StartupTask (TaskId PawOSStartup) is enabled/disabled instead. Windows never
 *   lets an app re-enable a task the user (or policy) turned off, so in that case a
 *   user-initiated toggle opens Settings > Apps > Startup instead of failing silently.
 *
 * The preference itself (SettingsStore.startWithWindows) keeps the same meaning in both builds.
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

  try {
    const state = await deps.storeTask.getState();
    if (enabled) {
      if (state === 'Enabled' || state === 'EnabledByPolicy') return;
      if (state === 'DisabledByUser' || state === 'DisabledByPolicy') {
        if (opts.userInitiated) await deps.openExternal(WINDOWS_STARTUP_SETTINGS_URI);
        return;
      }
      const result = await deps.storeTask.enable();
      if (result === 'DisabledByUser' && opts.userInitiated) await deps.openExternal(WINDOWS_STARTUP_SETTINGS_URI);
    } else if (state === 'Enabled') {
      await deps.storeTask.disable();
    }
  } catch (e) {
    console.error('[STARTUP] could not apply Start with Windows to the Store startup task', e);
    if (opts.userInitiated) {
      try {
        await deps.openExternal(WINDOWS_STARTUP_SETTINGS_URI);
      } catch {
        // nothing further to do — the error above is already logged
      }
    }
  }
}
