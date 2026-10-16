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

/**
 * Package family name for identity PawosAI.PawOS / CN=3749BDE7-E3A7-4F62-A2E7-33B2A93F803E
 * (Partner Center > Product identity). Fixed for that identity; used to read the startup task state.
 */
export const STORE_PACKAGE_FAMILY_NAME = 'PawosAI.PawOS_y5w6824kw3wcj';

/** Must match `appx.applicationId` in electron-builder.yml (the <Application Id> in the package manifest). */
export const STORE_APPLICATION_ID = 'PawOS';

/**
 * The Store build's Application User Model ID — what Windows itself calls the installed app
 * (`Get-StartApps` shows it): the package family name, "!", the application id. The Start tile and
 * the taskbar icon belong to this identity.
 */
export const STORE_APP_USER_MODEL_ID = `${STORE_PACKAGE_FAMILY_NAME}!${STORE_APPLICATION_ID}`;

/** Must match `appId` in electron-builder.yml: the identity the direct-download installer's shortcuts carry. */
export const DIRECT_APP_USER_MODEL_ID = 'com.pawos.pet';

/**
 * The identity the running process tells Electron it has. Electron files the jump list (and
 * notifications) under whatever it was told — and when told nothing, under its own default
 * ("electron.app.PawOS"), which no shortcut or tile carries.
 *
 * - Direct download: the installer shortcut's identity.
 * - Microsoft Store: the package's own identity. This does not override the package — it names it,
 *   so PawOS's jump list lands on the Start tile and taskbar icon Windows already shows.
 */
export function appUserModelId(proc: { windowsStore?: boolean } = process): string {
  return isStoreRuntime(proc) ? STORE_APP_USER_MODEL_ID : DIRECT_APP_USER_MODEL_ID;
}
