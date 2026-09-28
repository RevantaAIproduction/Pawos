/**
 * Single source of truth for "is this the Microsoft Store (MSIX) build?".
 *
 * Electron sets `process.windowsStore` to `true` only when the app runs from
 * an MSIX/AppX package; in the NSIS direct-download build it is `undefined`.
 * Everything Store-specific (updates, Start with Windows, pawos:// runtime
 * registration) branches on this helper so the NSIS code paths stay exactly
 * as they were.
 */
export type Distribution = 'store' | 'direct';

export function isStoreRuntime(proc: { windowsStore?: boolean } = process): boolean {
  return proc.windowsStore === true;
}

export function getDistribution(proc: { windowsStore?: boolean } = process): Distribution {
  return isStoreRuntime(proc) ? 'store' : 'direct';
}

/**
 * Microsoft Store "Downloads and updates" page — where Store installs check for,
 * download and apply their own updates. Needs no product id, so it works for
 * whatever Store product PawOS ends up published under.
 */
export const STORE_UPDATES_URI = 'ms-windows-store://downloadsandupdates';

/** Windows Settings > Apps > Startup — the only place a user can re-enable a startup task they turned off. */
export const WINDOWS_STARTUP_SETTINGS_URI = 'ms-settings:startupapps';

/** Must match the TaskId declared in build/msix/extensions.xml. */
export const STORE_STARTUP_TASK_ID = 'PawOSStartup';
