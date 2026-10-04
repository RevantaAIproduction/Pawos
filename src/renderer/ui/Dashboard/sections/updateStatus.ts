/**
 * Update status for Settings > Updates and the sidebar, driven by the updater IPC:
 * 'updater:check' / 'updater:quitAndInstall' / 'updater:getState' and the forwarded
 * 'updater:state' events (see src/main/platform/updaterSetup.ts).
 *  - Direct download (NSIS): checking → downloading → ready (restart to install).
 *  - Microsoft Store (MSIX): 'available' — a newer PawOS is in the Store; "Update" opens PawOS's
 *    own Store page, which installs it.
 */
export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'available' | 'upToDate' | 'error';

/** An 'updater:state' event from main, or one of this section's own check lifecycle steps. */
export type UpdateStatusEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'update-not-available'
  | 'store-update-available'
  | 'error'
  | { type: 'check-started' }
  | { type: 'check-finished'; ok: boolean };

export function nextUpdateStatus(current: UpdateStatus, event: UpdateStatusEvent | string): UpdateStatus {
  if (typeof event === 'object') {
    if (event.type === 'check-started') return 'checking';
    if (!event.ok) return current === 'downloading' || current === 'ready' || current === 'available' ? current : 'error';
    // The check resolved without any updater event (e.g. an unpackaged dev run, where
    // electron-updater skips checking) — don't leave the section stuck on "Checking…".
    return current === 'checking' ? 'idle' : current;
  }
  switch (event) {
    case 'checking-for-update':
      return 'checking';
    case 'update-available':
    case 'download-progress':
      return 'downloading';
    case 'update-downloaded':
      return 'ready';
    case 'store-update-available':
      return 'available';
    case 'update-not-available':
      return 'upToDate';
    case 'error':
      return 'error';
    default:
      return current;
  }
}

/** The status for a state main reports ('updater:getState'), e.g. when a window opens after a check. */
export function statusFromState(state: string | null | undefined): UpdateStatus {
  if (!state || state === 'idle') return 'idle';
  return nextUpdateStatus('idle', state);
}

/**
 * The sidebar's update button: shown ONLY while there is an update to act on (downloading, ready to
 * install, or waiting in the Store) — never as a permanent "Check for Updates" entry.
 */
export function sidebarUpdateButton(status: UpdateStatus, version: string | null = null): { label: string; action: 'install' | null } | null {
  switch (status) {
    case 'available':
      return { label: version ? `Update to ${version}` : 'Update available', action: 'install' };
    case 'downloading':
      return { label: 'Downloading update…', action: null };
    case 'ready':
      return { label: 'Restart to update', action: 'install' };
    default:
      return null;
  }
}

export interface UpdateStatusView {
  message: string;
  buttonLabel: string;
  action: 'check' | 'install' | null;
}

export function describeUpdateStatus(status: UpdateStatus, version: string | null = null): UpdateStatusView {
  switch (status) {
    case 'available':
      return {
        message: `${version ? `PawOS ${version}` : 'A new version of PawOS'} is available in the Microsoft Store.`,
        buttonLabel: 'Update',
        action: 'install',
      };
    case 'checking':
      return { message: 'Checking for updates…', buttonLabel: 'Checking…', action: null };
    case 'downloading':
      return { message: 'A new version of PawOS is downloading…', buttonLabel: 'Downloading…', action: null };
    case 'ready':
      return { message: 'An update is ready. PawOS will restart to install it.', buttonLabel: 'Apply Update', action: 'install' };
    case 'upToDate':
      return { message: 'PawOS is up to date.', buttonLabel: 'Check for Updates', action: 'check' };
    case 'error':
      return { message: "Couldn't check for updates. Please try again later.", buttonLabel: 'Check for Updates', action: 'check' };
    case 'idle':
    default:
      return { message: 'Check whether a newer version of PawOS is available.', buttonLabel: 'Check for Updates', action: 'check' };
  }
}
