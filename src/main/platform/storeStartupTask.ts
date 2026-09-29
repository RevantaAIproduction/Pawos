import { execFile } from 'child_process';
import { STORE_PACKAGE_FAMILY_NAME, STORE_STARTUP_TASK_ID } from './storeRuntime';

/** Windows.ApplicationModel.StartupTaskState, by value. */
export type StartupTaskState = 'Disabled' | 'DisabledByUser' | 'Enabled' | 'DisabledByPolicy' | 'EnabledByPolicy';
const STATE_BY_VALUE: readonly StartupTaskState[] = ['Disabled', 'DisabledByUser', 'Enabled', 'DisabledByPolicy', 'EnabledByPolicy'];

export function isStartupTaskOn(state: StartupTaskState | null): boolean {
  return state === 'Enabled' || state === 'EnabledByPolicy';
}

// Changing a StartupTask needs the WinRT API called with the package identity. Electron can't
// call WinRT, and processes PawOS launches (e.g. PowerShell) do NOT carry the package identity —
// StartupTask.GetAsync fails there with "Element not found" (0x80070490). So the Store build only
// READS the state Windows keeps for the task (plain HKCU registry, no identity needed); the user
// turns it on/off in Windows Settings > Apps > Startup.
const TASK_KEY =
  `HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\SystemAppData\\` +
  `${STORE_PACKAGE_FAMILY_NAME}\\${STORE_STARTUP_TASK_ID}`;

/** The startup task's current state, or null if Windows hasn't registered it (or it can't be read). */
export function readStartupTaskState(): Promise<StartupTaskState | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', TASK_KEY, '/v', 'State'], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const match = /State\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout.toString());
      const value = match?.[1] ? parseInt(match[1], 16) : NaN;
      resolve(STATE_BY_VALUE[value] ?? null);
    });
  });
}

export const storeStartupTask = {
  getState: readStartupTaskState,
};

export type StoreStartupTaskApi = typeof storeStartupTask;
