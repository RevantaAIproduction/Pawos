import { describe, it, expect, vi } from 'vitest';
import { getDistribution, isStoreRuntime, STORE_UPDATES_URI, WINDOWS_STARTUP_SETTINGS_URI } from './storeRuntime';
import { registerUpdater } from './updaterSetup';
import { registerPawosProtocolClient } from './protocolRegistration';
import { applyStartWithWindows, getStartWithWindowsStatus, type StartWithWindowsDeps } from './startWithWindows';
import type { StartupTaskState } from './storeStartupTask';

describe('storeRuntime', () => {
  it('is the Store build only when process.windowsStore is exactly true', () => {
    expect(isStoreRuntime({ windowsStore: true })).toBe(true);
    expect(isStoreRuntime({ windowsStore: false })).toBe(false);
    expect(isStoreRuntime({})).toBe(false);
    expect(getDistribution({ windowsStore: true })).toBe('store');
    expect(getDistribution({})).toBe('direct');
  });
});

function fakeIpcMain() {
  const handlers = new Map<string, (...args: any[]) => any>();
  return { handlers, handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn) };
}

function fakeAutoUpdater() {
  return { checkForUpdates: vi.fn().mockResolvedValue(undefined), quitAndInstall: vi.fn(), on: vi.fn() };
}

describe('registerUpdater', () => {
  it('Store build: never constructs electron-updater, opens the Store for updates, and never installs', async () => {
    const ipcMain = fakeIpcMain();
    const loadAutoUpdater = vi.fn();
    const sendState = vi.fn();
    const openExternal = vi.fn().mockResolvedValue(undefined);

    expect(registerUpdater({ ipcMain, isStore: true, loadAutoUpdater, sendState, openExternal })).toBe('store');

    await expect(ipcMain.handlers.get('updater:check')!()).resolves.toBe(true);
    await expect(ipcMain.handlers.get('updater:quitAndInstall')!()).resolves.toBe(false);
    expect(openExternal).toHaveBeenCalledWith(STORE_UPDATES_URI);
    expect(loadAutoUpdater).not.toHaveBeenCalled();
    expect(sendState).not.toHaveBeenCalled();
  });

  it('direct (NSIS) build: keeps the electron-updater check / install / event forwarding flow', async () => {
    const ipcMain = fakeIpcMain();
    const updater = fakeAutoUpdater();
    const sendState = vi.fn();
    const openExternal = vi.fn();

    expect(registerUpdater({ ipcMain, isStore: false, loadAutoUpdater: () => updater as any, sendState, openExternal })).toBe('direct');

    await expect(ipcMain.handlers.get('updater:check')!()).resolves.toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await expect(ipcMain.handlers.get('updater:quitAndInstall')!()).resolves.toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(openExternal).not.toHaveBeenCalled();

    const events = updater.on.mock.calls.map(([name]) => name);
    expect(events).toEqual(['checking-for-update', 'update-available', 'download-progress', 'update-downloaded', 'update-not-available', 'error']);
    const downloaded = updater.on.mock.calls.find(([name]) => name === 'update-downloaded')![1];
    downloaded();
    expect(sendState).toHaveBeenCalledWith('update-downloaded');
  });
});

describe('registerPawosProtocolClient', () => {
  it('Store build: relies on the manifest and does not register at runtime', () => {
    const setAsDefaultProtocolClient = vi.fn();
    expect(
      registerPawosProtocolClient({ isStore: true, defaultApp: undefined, argv: ['PawOS.exe'], execPath: 'PawOS.exe', setAsDefaultProtocolClient })
    ).toBe('manifest');
    expect(setAsDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it('direct (NSIS) packaged build: registers pawos at runtime exactly as before', () => {
    const setAsDefaultProtocolClient = vi.fn();
    registerPawosProtocolClient({ isStore: false, defaultApp: undefined, argv: ['PawOS.exe'], execPath: 'PawOS.exe', setAsDefaultProtocolClient });
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith('pawos');
  });

  it('dev (`electron .`): registers with the exe path and script arg', () => {
    const setAsDefaultProtocolClient = vi.fn();
    registerPawosProtocolClient({ isStore: false, defaultApp: true, argv: ['electron.exe', '.'], execPath: 'electron.exe', setAsDefaultProtocolClient });
    expect(setAsDefaultProtocolClient).toHaveBeenCalledWith('pawos', 'electron.exe', [expect.any(String)]);
  });
});

function startupDeps(overrides: Partial<StartWithWindowsDeps> & { state?: StartupTaskState | null } = {}) {
  const state = overrides.state === undefined ? 'Disabled' : overrides.state;
  const deps: StartWithWindowsDeps = {
    isStore: true,
    setLoginItemSettings: vi.fn(),
    exePath: 'C:\\PawOS\\PawOS.exe',
    storeTask: { getState: vi.fn().mockResolvedValue(state) },
    openExternal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return deps;
}

describe('applyStartWithWindows', () => {
  it('direct (NSIS) build: uses the HKCU Run key via setLoginItemSettings, unchanged', async () => {
    const deps = startupDeps({ isStore: false });
    await applyStartWithWindows(true, deps, { userInitiated: false });
    expect(deps.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, path: 'C:\\PawOS\\PawOS.exe' });
    expect(deps.storeTask.getState).not.toHaveBeenCalled();
  });

  it('Store build: launching PawOS never changes Windows startup (no settings page, no Run key)', async () => {
    for (const pref of [true, false]) {
      const deps = startupDeps({ state: 'Disabled' });
      await applyStartWithWindows(pref, deps, { userInitiated: false });
      expect(deps.openExternal).not.toHaveBeenCalled();
      expect(deps.setLoginItemSettings).not.toHaveBeenCalled();
    }
  });

  it('Store build: toggling ON while Windows has it off opens Windows Startup settings', async () => {
    const deps = startupDeps({ state: 'Disabled' });
    await applyStartWithWindows(true, deps, { userInitiated: true });
    expect(deps.openExternal).toHaveBeenCalledWith(WINDOWS_STARTUP_SETTINGS_URI);
    expect(deps.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('Store build: toggling OFF while Windows has it on opens Windows Startup settings', async () => {
    const deps = startupDeps({ state: 'Enabled' });
    await applyStartWithWindows(false, deps, { userInitiated: true });
    expect(deps.openExternal).toHaveBeenCalledWith(WINDOWS_STARTUP_SETTINGS_URI);
  });

  it('Store build: no settings page when Windows already matches the toggle', async () => {
    const on = startupDeps({ state: 'Enabled' });
    await applyStartWithWindows(true, on, { userInitiated: true });
    const off = startupDeps({ state: 'DisabledByUser' });
    await applyStartWithWindows(false, off, { userInitiated: true });
    expect(on.openExternal).not.toHaveBeenCalled();
    expect(off.openExternal).not.toHaveBeenCalled();
  });

  it('Store build: unknown Windows state still sends the user to Startup settings; errors are logged, not thrown', async () => {
    const unknown = startupDeps({ state: null });
    await applyStartWithWindows(true, unknown, { userInitiated: true });
    expect(unknown.openExternal).toHaveBeenCalledWith(WINDOWS_STARTUP_SETTINGS_URI);

    const log = vi.fn();
    const failing = startupDeps({ log });
    (failing.storeTask.getState as any).mockRejectedValue(new Error('boom'));
    await expect(applyStartWithWindows(true, failing, { userInitiated: true })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('toggle: FAILED — boom'));
  });
});

describe('getStartWithWindowsStatus', () => {
  it('Store build reports what Windows will actually do; direct build defers to the saved preference', async () => {
    await expect(getStartWithWindowsStatus(startupDeps({ state: 'Enabled' }))).resolves.toEqual({ managedByWindows: true, enabled: true });
    await expect(getStartWithWindowsStatus(startupDeps({ state: 'EnabledByPolicy' }))).resolves.toEqual({ managedByWindows: true, enabled: true });
    await expect(getStartWithWindowsStatus(startupDeps({ state: 'DisabledByUser' }))).resolves.toEqual({ managedByWindows: true, enabled: false });
    await expect(getStartWithWindowsStatus(startupDeps({ state: null }))).resolves.toEqual({ managedByWindows: true, enabled: null });
    await expect(getStartWithWindowsStatus(startupDeps({ isStore: false }))).resolves.toEqual({ managedByWindows: false, enabled: null });
  });
});
