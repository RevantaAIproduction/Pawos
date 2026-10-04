import { describe, it, expect, vi } from 'vitest';
import { getDistribution, isStoreRuntime, STORE_UPDATES_URI, WINDOWS_STARTUP_SETTINGS_URI } from './storeRuntime';
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, registerUpdater } from './updaterSetup';
import { compareVersions, fetchLatestStoreVersion, latestVersionInCatalog, STORE_CATALOG_URL, STORE_PRODUCT_URI } from './storeUpdates';
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
  const listeners = new Map<string, (...args: any[]) => void>();
  return {
    listeners,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((name: string, fn: (...args: any[]) => void) => listeners.set(name, fn)),
  };
}

/** Timers the test fires by hand: [delay, fn] pairs. */
function fakeTimers() {
  const timeouts: Array<[number, () => void]> = [];
  const intervals: Array<[number, () => void]> = [];
  return {
    timeouts,
    intervals,
    timers: {
      setTimeout: (fn: () => void, ms: number) => timeouts.push([ms, fn]),
      setInterval: (fn: () => void, ms: number) => intervals.push([ms, fn]),
    },
  };
}

function updaterDeps(overrides: Partial<Parameters<typeof registerUpdater>[0]> = {}) {
  const ipcMain = fakeIpcMain();
  const clock = fakeTimers();
  const deps = {
    ipcMain,
    isStore: true,
    currentVersion: '1.0.1',
    loadAutoUpdater: vi.fn(),
    hasUpdateFeed: true,
    fetchLatestStoreVersion: vi.fn().mockResolvedValue('1.0.1.0'),
    sendState: vi.fn(),
    notify: vi.fn(),
    showApp: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
    timers: clock.timers,
    ...overrides,
  };
  return { deps, ipcMain, clock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('registerUpdater — Microsoft Store build', () => {
  it('never constructs electron-updater, and checks on its own after launch and every few hours', async () => {
    const { deps, clock } = updaterDeps();
    expect(registerUpdater(deps)).toBe('store');
    expect(deps.loadAutoUpdater).not.toHaveBeenCalled();
    expect(clock.timeouts.map(([ms]) => ms)).toEqual([FIRST_CHECK_DELAY_MS]);
    expect(clock.intervals.map(([ms]) => ms)).toEqual([CHECK_INTERVAL_MS]);
    clock.timeouts[0]![1]();
    await flush();
    expect(deps.fetchLatestStoreVersion).toHaveBeenCalledTimes(1);
  });

  it('a newer Store version: reports it, notifies once, and Update opens PawOS\'s own Store page — not the library', async () => {
    const { deps, ipcMain, clock } = updaterDeps({ fetchLatestStoreVersion: vi.fn().mockResolvedValue('1.0.2.0') });
    registerUpdater(deps);
    clock.timeouts[0]![1]();
    await flush();

    expect(deps.sendState).toHaveBeenCalledWith('store-update-available');
    await expect(ipcMain.handlers.get('updater:getState')!()).resolves.toEqual({ state: 'store-update-available', version: '1.0.2.0' });
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify.mock.calls[0]![0]).toMatchObject({ title: 'PawOS update available', body: expect.stringContaining('1.0.2.0') });

    // Later checks don't notify again for the same version.
    clock.intervals[0]![1]();
    await flush();
    expect(deps.notify).toHaveBeenCalledTimes(1);

    // Clicking the notification or Update: PawOS's product page in the Store.
    deps.notify.mock.calls[0]![0].onClick();
    await expect(ipcMain.handlers.get('updater:quitAndInstall')!()).resolves.toBe(true);
    expect(deps.openExternal).toHaveBeenCalledWith(STORE_PRODUCT_URI);
    expect(deps.openExternal).not.toHaveBeenCalledWith(STORE_UPDATES_URI);
  });

  it('up to date: no notification, and the sidebar has nothing to show', async () => {
    const { deps, ipcMain } = updaterDeps({ fetchLatestStoreVersion: vi.fn().mockResolvedValue('1.0.1.0') });
    registerUpdater(deps);
    await expect(ipcMain.handlers.get('updater:check')!()).resolves.toBe(true);
    expect(deps.sendState).toHaveBeenLastCalledWith('update-not-available');
    expect(deps.notify).not.toHaveBeenCalled();
    expect(deps.openExternal).not.toHaveBeenCalled(); // checking never opens the Store
  });

  it('Store unreachable: a manual check reports an error; a background check changes nothing', async () => {
    const { deps, ipcMain, clock } = updaterDeps({ fetchLatestStoreVersion: vi.fn().mockResolvedValue(null) });
    registerUpdater(deps);
    clock.timeouts[0]![1]();
    await flush();
    expect(deps.sendState).not.toHaveBeenCalled();
    await expect(ipcMain.handlers.get('updater:check')!()).resolves.toBe(false);
    expect(deps.sendState).toHaveBeenLastCalledWith('error');
  });
});

describe('registerUpdater — direct download (NSIS) build', () => {
  it('keeps the electron-updater flow, checks automatically, and notifies once a download is ready', async () => {
    const updater = fakeAutoUpdater();
    const { deps, ipcMain, clock } = updaterDeps({ isStore: false, loadAutoUpdater: () => updater as any });
    expect(registerUpdater(deps)).toBe('direct');

    await expect(ipcMain.handlers.get('updater:check')!()).resolves.toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(clock.timeouts.map(([ms]) => ms)).toEqual([FIRST_CHECK_DELAY_MS]);
    expect(clock.intervals.map(([ms]) => ms)).toEqual([CHECK_INTERVAL_MS]);

    const events = updater.on.mock.calls.map(([name]) => name);
    expect(events).toEqual(['checking-for-update', 'update-available', 'download-progress', 'update-downloaded', 'update-not-available', 'error']);

    updater.listeners.get('update-available')!({ version: '1.0.2' });
    updater.listeners.get('update-downloaded')!({ version: '1.0.2' });
    expect(deps.sendState).toHaveBeenCalledWith('update-downloaded');
    await expect(ipcMain.handlers.get('updater:getState')!()).resolves.toEqual({ state: 'update-downloaded', version: '1.0.2' });
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify.mock.calls[0]![0]).toMatchObject({ title: 'PawOS update ready' });

    // A later background check or error doesn't hide an update that is ready to install.
    updater.listeners.get('checking-for-update')!();
    updater.listeners.get('error')!(new Error('offline'));
    await expect(ipcMain.handlers.get('updater:getState')!()).resolves.toMatchObject({ state: 'update-downloaded' });

    await expect(ipcMain.handlers.get('updater:quitAndInstall')!()).resolves.toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it('without an update feed (dev run): no automatic checks', () => {
    const updater = fakeAutoUpdater();
    const { deps, clock } = updaterDeps({ isStore: false, hasUpdateFeed: false, loadAutoUpdater: () => updater as any });
    registerUpdater(deps);
    expect(clock.timeouts).toHaveLength(0);
    expect(clock.intervals).toHaveLength(0);
  });
});

describe('Store catalog version', () => {
  it('reads PawOS\'s newest package version from the catalog, whatever its layout', () => {
    const body = JSON.stringify({
      Products: [{ DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [
        { PackageFullName: 'PawosAI.PawOS_1.0.1.0_x64__y5w6824kw3wcj' },
        { PackageFullName: 'PawosAI.PawOS_1.0.10.0_x64__y5w6824kw3wcj' },
        { PackageFullName: 'PawosAI.PawOS_1.0.9.0_arm64__y5w6824kw3wcj' },
        { PackageFullName: 'SomeoneElse.App_9.9.9.0_x64__abc' },
      ] } } }] }],
    });
    expect(latestVersionInCatalog(body)).toBe('1.0.10.0');
    expect(latestVersionInCatalog('{"Products":[]}')).toBeNull();
  });

  it('compares versions numerically, with or without the fourth part', () => {
    expect(compareVersions('1.0.2.0', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1.0', '1.0.1')).toBe(0);
    expect(compareVersions('1.0.9', '1.0.10')).toBe(-1);
  });

  it('fetch failures and non-OK answers mean "unknown", never a version', async () => {
    await expect(fetchLatestStoreVersion(async () => { throw new Error('offline'); })).resolves.toBeNull();
    await expect(fetchLatestStoreVersion(async () => ({ ok: false, text: async () => '' }))).resolves.toBeNull();
    await expect(fetchLatestStoreVersion(async (url) => {
      expect(url).toBe(STORE_CATALOG_URL);
      return { ok: true, text: async () => '"PawosAI.PawOS_2.0.0.0_x64__y5w6824kw3wcj"' };
    })).resolves.toBe('2.0.0.0');
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
