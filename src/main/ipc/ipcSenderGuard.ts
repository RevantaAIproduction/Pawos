import { app, ipcMain } from 'electron';

/**
 * Only PawOS's own pages may call the main process.
 *
 * Every privileged capability the app has (files, commands, credentials, billing) is reached through
 * ipcMain handlers, and the preload bridge that exposes them travels with a window wherever it
 * goes: if a window were ever navigated to a web page, or opened a child window onto one, that page
 * would hold the same bridge. So the main process does not take "it came over IPC" as proof of
 * anything — each call is accepted only when the frame that sent it is showing the app's own
 * bundled page (a file: URL; both app windows load dist/renderer/index.html from disk). A call from
 * any other origin (http, https, data, blob, about:) is refused before its handler runs.
 *
 * Imported first in main.ts so it wraps ipcMain before any handler is registered.
 *
 * This is about WHERE a call comes from. It does not replace the checks handlers make on what they
 * are asked to do.
 */

/** True when `url` is a page the app itself ships. In development the webpack dev server on this machine is accepted too. */
export function isTrustedIpcSenderUrl(url: string | undefined | null, isPackaged: boolean): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:') return true;
  if (!isPackaged && parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true;
  return false;
}

type IpcEventLike = { senderFrame?: { url?: string } | null; sender?: { getURL?: () => string } };

/** The URL of the frame that sent an IPC message (the frame itself when known, otherwise its window's page). */
export function ipcSenderUrl(event: IpcEventLike): string | undefined {
  try {
    return event.senderFrame?.url || event.sender?.getURL?.();
  } catch {
    return undefined; // the frame was destroyed between sending and handling
  }
}

let installed = false;

/** Wraps ipcMain.handle / on / once so every handler registered afterwards is reached only from the app's own pages. */
export function installIpcSenderGuard(isPackaged: () => boolean = () => app.isPackaged): void {
  if (installed) return;
  installed = true;

  const trusted = (event: IpcEventLike, channel: string): boolean => {
    if (isTrustedIpcSenderUrl(ipcSenderUrl(event), isPackaged())) return true;
    // The channel only — never the arguments, which can carry credentials.
    console.warn(`[ipc] refused "${channel}" from a page that is not part of PawOS`);
    return false;
  };

  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    handle(channel, (event, ...args) => {
      if (!trusted(event, channel)) throw new Error('This page is not allowed to use PawOS.');
      return listener(event, ...args);
    });

  for (const method of ['on', 'once'] as const) {
    const register = ipcMain[method].bind(ipcMain);
    ipcMain[method] = (channel, listener) =>
      register(channel, (event, ...args) => {
        if (!trusted(event, channel)) return;
        listener(event, ...args);
      });
  }
}

installIpcSenderGuard();
