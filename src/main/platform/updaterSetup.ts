import type { AppUpdater } from 'electron-updater';
import { STORE_UPDATES_URI } from './storeRuntime';

type IpcMainLike = { handle(channel: string, listener: (...args: any[]) => any): void };

export interface UpdaterSetupDeps {
  ipcMain: IpcMainLike;
  isStore: boolean;
  /**
   * Returns electron-updater's `autoUpdater`. Its getter is what constructs the
   * NsisUpdater, so this is only ever called for direct-download (NSIS) builds.
   */
  loadAutoUpdater: () => AppUpdater;
  /** Forwards an updater lifecycle state to the renderer ("updater:state"). */
  sendState: (state: string) => void;
  openExternal: (url: string) => Promise<void>;
}

/**
 * Registers the renderer's updater IPC ('updater:check', 'updater:quitAndInstall').
 *
 * - Direct download (NSIS): electron-updater checks, downloads and installs, and
 *   its lifecycle events are forwarded to the renderer — unchanged behavior.
 * - Microsoft Store (MSIX): the Store is the update authority. electron-updater is
 *   never constructed; "check" opens the Store's Downloads and updates page and
 *   "quit and install" is a no-op. No updater:state events are sent, so the UI
 *   never shows a download/install state PawOS isn't actually doing.
 */
export function registerUpdater(deps: UpdaterSetupDeps): 'store' | 'direct' {
  const { ipcMain, sendState } = deps;

  if (deps.isStore) {
    ipcMain.handle('updater:check', async () => {
      try {
        await deps.openExternal(STORE_UPDATES_URI);
        return true;
      } catch (e) {
        console.error('[UPDATER] could not open Microsoft Store updates', e);
        return false;
      }
    });
    ipcMain.handle('updater:quitAndInstall', async () => false);
    return 'store';
  }

  const autoUpdater = deps.loadAutoUpdater();

  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return true;
    } catch (e) {
      console.error('[UPDATER] check error', e);
      return false;
    }
  });

  ipcMain.handle('updater:quitAndInstall', async () => {
    try {
      autoUpdater.quitAndInstall();
      return true;
    } catch (e) {
      console.error('[UPDATER] quitAndInstall error', e);
      return false;
    }
  });

  autoUpdater.on('checking-for-update', () => sendState('checking-for-update'));
  autoUpdater.on('update-available', () => sendState('update-available'));
  autoUpdater.on('download-progress', () => sendState('download-progress'));
  autoUpdater.on('update-downloaded', () => sendState('update-downloaded'));
  autoUpdater.on('update-not-available', () => sendState('update-not-available'));
  autoUpdater.on('error', (err) => {
    console.error('[UPDATER] error event', err);
    sendState('error');
  });

  return 'direct';
}
