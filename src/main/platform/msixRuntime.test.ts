import { describe, it, expect, vi } from 'vitest';
import { getDistribution, isStoreRuntime, STORE_UPDATES_URI, WINDOWS_STARTUP_SETTINGS_URI } from './storeRuntime';
import { registerUpdater } from './updaterSetup';
import { registerPawosProtocolClient } from './protocolRegistration';
import { applyStartWithWindows, type StartWithWindowsDeps } from './startWithWindows';
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

function startupDeps(overrides: Partial<StartWithWindowsDeps> & { state?: StartupTaskState } = {}) {
  const state = overrides.state ?? 'Disabled';
  const deps: StartWithWindowsDeps = {
    isStore: true,
    setLoginItemSettings: vi.fn(),
    exePath: 'C:\\PawOS\\PawOS.exe',
    storeTask: {
      getState: vi.fn().mockResolvedValue(state),
      enable: vi.fn().mockResolvedValue('Enabled'),
      disable: vi.fn().mockResolvedValue('Disabled'),
    },
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

  it('Store build: never touches the Run key; enables the StartupTask when the preference is on', async () => {
    const deps = startupDeps({ state: 'Disabled' });
    await applyStartWithWindows(true, deps, { userInitiated: false });
    expect(deps.setLoginItemSettings).not.toHaveBeenCalled();
    expect(deps.storeTask.enable).toHaveBeenCalledTimes(1);
  });

  it('Store build: disables the StartupTask when the preference is off', async () => {
    const deps = startupDeps({ state: 'Enabled' });
    await applyStartWithWindows(false, deps, { userInitiated: true });
    expect(deps.storeTask.disable).toHaveBeenCalledTimes(1);
    expect(deps.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('Store build: respects a task the user disabled in Windows — no re-enable; the toggle opens Startup settings', async () => {
    const atStartup = startupDeps({ state: 'DisabledByUser' });
    await applyStartWithWindows(true, atStartup, { userInitiated: false });
    expect(atStartup.storeTask.enable).not.toHaveBeenCalled();
    expect(atStartup.openExternal).not.toHaveBeenCalled();

    const fromToggle = startupDeps({ state: 'DisabledByUser' });
    await applyStartWithWindows(true, fromToggle, { userInitiated: true });
    expect(fromToggle.storeTask.enable).not.toHaveBeenCalled();
    expect(fromToggle.openExternal).toHaveBeenCalledWith(WINDOWS_STARTUP_SETTINGS_URI);
  });

  it('Store build: a StartupTask failure is logged, not thrown', async () => {
    const deps = startupDeps();
    (deps.storeTask.getState as any).mockRejectedValue(new Error('no package identity'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(applyStartWithWindows(true, deps, { userInitiated: false })).resolves.toBeUndefined();
    expect(deps.openExternal).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
