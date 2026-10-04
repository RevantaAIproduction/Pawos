import type { AppUpdater } from 'electron-updater';
import { compareVersions, STORE_PRODUCT_URI } from './storeUpdates';

type IpcMainLike = { handle(channel: string, listener: (...args: any[]) => any): void };

/**
 * The update state main keeps and the renderer shows. The direct-download names are electron-updater's
 * own events; 'store-update-available' is the Store build's "a newer PawOS is in the Store".
 */
export type UpdaterState =
  | 'idle'
  | 'checking-for-update'
  | 'update-not-available'
  | 'update-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'store-update-available'
  | 'error';

export interface UpdaterSnapshot {
  state: UpdaterState;
  /** The newer version, when one is known. */
  version: string | null;
}

export interface UpdaterNotification {
  title: string;
  body: string;
  onClick: () => void;
}

export interface UpdaterSetupDeps {
  ipcMain: IpcMainLike;
  isStore: boolean;
  /** The running PawOS version (app.getVersion()). */
  currentVersion: string;
  /**
   * Returns electron-updater's `autoUpdater`. Its getter is what constructs the
   * NsisUpdater, so this is only ever called for direct-download (NSIS) builds.
   */
  loadAutoUpdater: () => AppUpdater;
  /** Direct build: whether an update feed is configured (resources/app-update.yml). Without one there is nothing to check. */
  hasUpdateFeed: boolean;
  /** Store build: the newest PawOS version published in the Store, or null when it can't be told. */
  fetchLatestStoreVersion: () => Promise<string | null>;
  /** Forwards an updater state to the renderer ("updater:state"). */
  sendState: (state: UpdaterState) => void;
  /** Shows a system notification. */
  notify: (notification: UpdaterNotification) => void;
  /** Brings the PawOS window to the front. */
  showApp: () => void;
  openExternal: (url: string) => Promise<void>;
  /** Automatic checks: the first shortly after launch, then on an interval. Tests pass their own timers. */
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    setInterval: (fn: () => void, ms: number) => unknown;
  };
}

/** First automatic check after launch, then every six hours while PawOS runs. */
export const FIRST_CHECK_DELAY_MS = 30_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Registers the renderer's updater IPC ('updater:check', 'updater:quitAndInstall', 'updater:getState')
 * and checks for updates automatically, so the user hears about an update without looking for it.
 *
 * - Direct download (NSIS): electron-updater checks, downloads and installs. When a download is
 *   ready, a notification says so and "Restart to update" applies it.
 * - Microsoft Store (MSIX): the Store installs updates; electron-updater is never constructed.
 *   PawOS compares its version with the newest one in the Store catalog; when the Store has a newer
 *   one, a notification says so and "Update" opens PawOS's own Store page (Update button), not the
 *   Store's Downloads and updates library.
 */
export function registerUpdater(deps: UpdaterSetupDeps): 'store' | 'direct' {
  const timers = deps.timers ?? { setTimeout, setInterval };
  let snapshot: UpdaterSnapshot = { state: 'idle', version: null };
  let notifiedVersion: string | null = null;

  const setState = (state: UpdaterState, version: string | null = snapshot.version) => {
    snapshot = { state, version };
    deps.sendState(state);
  };
  const notifyOnce = (version: string, notification: UpdaterNotification) => {
    if (notifiedVersion === version) return;
    notifiedVersion = version;
    try {
      deps.notify(notification);
    } catch (e) {
      console.error('[UPDATER] notification failed', e);
    }
  };

  deps.ipcMain.handle('updater:getState', async () => snapshot);

  if (deps.isStore) {
    const openStorePage = async () => {
      try {
        await deps.openExternal(STORE_PRODUCT_URI);
        return true;
      } catch (e) {
        console.error('[UPDATER] could not open PawOS in the Microsoft Store', e);
        return false;
      }
    };

    const check = async (manual: boolean): Promise<boolean> => {
      const before = snapshot;
      if (manual) setState('checking-for-update');
      const latest = await deps.fetchLatestStoreVersion();
      if (latest === null) {
        // A background check that couldn't reach the Store changes nothing the user sees.
        if (manual) setState('error', before.version);
        return false;
      }
      if (compareVersions(latest, deps.currentVersion) > 0) {
        setState('store-update-available', latest);
        notifyOnce(latest, {
          title: 'PawOS update available',
          body: `PawOS ${latest} is ready in the Microsoft Store. Click to update.`,
          onClick: () => void openStorePage(),
        });
      } else if (manual || snapshot.state !== 'store-update-available') {
        setState('update-not-available', null);
      }
      return true;
    };

    deps.ipcMain.handle('updater:check', async () => check(true));
    // "Update": PawOS's own page in the Store, which updates it — the Store does the install.
    deps.ipcMain.handle('updater:quitAndInstall', async () => openStorePage());

    timers.setTimeout(() => void check(false), FIRST_CHECK_DELAY_MS);
    timers.setInterval(() => void check(false), CHECK_INTERVAL_MS);
    return 'store';
  }

  const autoUpdater = deps.loadAutoUpdater();

  const check = async (): Promise<boolean> => {
    try {
      await autoUpdater.checkForUpdates();
      return true;
    } catch (e) {
      console.error('[UPDATER] check error', e);
      return false;
    }
  };

  deps.ipcMain.handle('updater:check', async () => check());

  deps.ipcMain.handle('updater:quitAndInstall', async () => {
    try {
      autoUpdater.quitAndInstall();
      return true;
    } catch (e) {
      console.error('[UPDATER] quitAndInstall error', e);
      return false;
    }
  });

  const versionOf = (info: unknown): string | null => {
    const version = (info as { version?: unknown } | undefined)?.version;
    return typeof version === 'string' ? version : null;
  };

  autoUpdater.on('checking-for-update', () => {
    // A download in progress or waiting to be applied stays what the user sees.
    if (snapshot.state !== 'update-downloaded' && snapshot.state !== 'download-progress') setState('checking-for-update');
  });
  autoUpdater.on('update-available', (info: unknown) => setState('update-available', versionOf(info)));
  autoUpdater.on('download-progress', () => setState('download-progress'));
  autoUpdater.on('update-downloaded', (info: unknown) => {
    const version = versionOf(info) ?? snapshot.version;
    setState('update-downloaded', version);
    notifyOnce(version ?? 'downloaded', {
      title: 'PawOS update ready',
      body: `${version ? `PawOS ${version}` : 'A new version of PawOS'} has been downloaded. Restart PawOS to finish updating.`,
      onClick: () => deps.showApp(),
    });
  });
  autoUpdater.on('update-not-available', () => setState('update-not-available', null));
  autoUpdater.on('error', (err) => {
    console.error('[UPDATER] error event', err);
    if (snapshot.state !== 'update-downloaded') setState('error');
  });

  // Without an update feed (a dev run, or a build published without one) there is nothing to check.
  if (deps.hasUpdateFeed) {
    timers.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    timers.setInterval(() => void check(), CHECK_INTERVAL_MS);
  }

  return 'direct';
}
