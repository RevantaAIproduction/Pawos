/**
 * Direct-download (NSIS) update status for Settings > Updates, driven by the existing
 * electron-updater IPC: 'updater:check' / 'updater:quitAndInstall' and the forwarded
 * 'updater:state' events (see src/main/platform/updaterSetup.ts). Not used for the
 * Microsoft Store build, where the Store handles updates.
 */
export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'upToDate' | 'error';

/** An 'updater:state' event from main, or one of this section's own check lifecycle steps. */
export type UpdateStatusEvent =
  | 'checking-for-update'
  | 'update-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'update-not-available'
  | 'error'
  | { type: 'check-started' }
  | { type: 'check-finished'; ok: boolean };

export function nextUpdateStatus(current: UpdateStatus, event: UpdateStatusEvent | string): UpdateStatus {
  if (typeof event === 'object') {
    if (event.type === 'check-started') return 'checking';
    if (!event.ok) return current === 'downloading' || current === 'ready' ? current : 'error';
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
    case 'update-not-available':
      return 'upToDate';
    case 'error':
      return 'error';
    default:
      return current;
  }
}

export interface UpdateStatusView {
  message: string;
  buttonLabel: string;
  action: 'check' | 'install' | null;
}

export function describeUpdateStatus(status: UpdateStatus): UpdateStatusView {
  switch (status) {
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
