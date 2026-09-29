import { app, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { isStoreRuntime } from './storeRuntime';
import { storeStartupTask } from './storeStartupTask';
import type { StartWithWindowsDeps } from './startWithWindows';

const LOG_MAX_BYTES = 64 * 1024;

/** `<userData>/logs/start-with-windows.log` — the Store build's only record of StartupTask results. */
export function startWithWindowsLogPath(): string {
  return path.join(app.getPath('userData'), 'logs', 'start-with-windows.log');
}

function appendLog(line: string) {
  try {
    const file = startWithWindowsLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > LOG_MAX_BYTES) fs.renameSync(file, `${file}.1`);
    } catch {
      // no log yet
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch {
    // diagnostics only
  }
}

/** Shared by the launch-time sync (main.ts) and the Settings toggle (ipc.ts). */
export function electronStartWithWindowsDeps(): StartWithWindowsDeps {
  return {
    isStore: isStoreRuntime(),
    setLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
    exePath: app.getPath('exe'),
    storeTask: storeStartupTask,
    openExternal: (url) => shell.openExternal(url),
    log: appendLog,
  };
}
