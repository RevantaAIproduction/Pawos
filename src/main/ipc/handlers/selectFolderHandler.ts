import { dialog, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

/**
 * Opens a native folder selection dialog and returns the selected path.
 * Returns null if the user cancels.
 */
export async function selectFolder(evt: IpcMainInvokeEvent): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });

  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0] ?? null;
}
