import type { App } from 'electron';

/**
 * PawOS's Windows jump list — the task list Windows shows for the app in Start search, on the
 * Start tile and on the taskbar icon ("Open", "New Chat", …).
 *
 * Why this exists: Windows keeps one task list per app identity, and whichever process last wrote
 * it wins. A PowerShell process started by PawOS runs under PawOS's identity in the Microsoft Store
 * build, and Windows PowerShell writes its own tasks on startup ("Run as Administrator", "Run ISE
 * as Administrator", "Windows PowerShell ISE") — which is how those ended up under PawOS. PawOS
 * never wrote a list of its own, so nothing replaced them. This writes PawOS's list at startup and
 * re-writes it periodically, so anything a child process leaves there is short-lived.
 *
 * Each task relaunches PawOS with one argument; the running instance receives it through the
 * existing single-instance handoff (`second-instance`) and acts on it. The Store build launches
 * through the registered pawos:// protocol instead of the executable path, since a packaged app's
 * executable is not meant to be started by path.
 */

export type JumpAction = 'new-chat' | 'continue' | 'new-code-session' | 'open-dashboard';

const JUMP_ACTIONS: readonly JumpAction[] = ['new-chat', 'continue', 'new-code-session', 'open-dashboard'];
const ARG_PREFIX = '--paw-jump=';
const PROTOCOL_PREFIX = 'pawos://jump/';

const TASKS: { action: JumpAction; title: string; description: string }[] = [
  { action: 'new-chat', title: 'New Chat', description: 'Start a new chat with Paw' },
  { action: 'continue', title: 'Continue Current Work', description: 'Return to the chat you were last working in' },
  { action: 'new-code-session', title: 'New Code Session', description: 'Choose a project folder and start working in it' },
  { action: 'open-dashboard', title: 'Open Dashboard', description: 'Open the PawOS dashboard' },
];

/** The jump action a launch was asked for, from either launch form. Null for an ordinary launch. */
export function extractJumpAction(argv: readonly string[]): JumpAction | null {
  for (const arg of argv) {
    const value = arg.startsWith(ARG_PREFIX) ? arg.slice(ARG_PREFIX.length) : arg.startsWith(PROTOCOL_PREFIX) ? arg.slice(PROTOCOL_PREFIX.length).replace(/\/+$/, '') : null;
    if (value && (JUMP_ACTIONS as readonly string[]).includes(value)) return value as JumpAction;
  }
  return null;
}

/** True for a pawos://jump/… URL, which is a jump-list launch and not an OAuth callback. */
export function isJumpProtocolUrl(url: string): boolean {
  return url.startsWith(PROTOCOL_PREFIX);
}

export interface JumpListTarget {
  /** The Microsoft Store (MSIX) build. */
  store: boolean;
  execPath: string;
  /** Extra leading arguments needed to relaunch (an unpackaged dev run needs the app path). */
  relaunchArgs?: string[];
}

export function buildJumpTasks(target: JumpListTarget): Electron.Task[] {
  const explorer = `${process.env.SystemRoot ?? 'C:\\Windows'}\\explorer.exe`;
  return TASKS.map((task) => ({
    program: target.store ? explorer : target.execPath,
    arguments: target.store ? `${PROTOCOL_PREFIX}${task.action}` : [...(target.relaunchArgs ?? []), `${ARG_PREFIX}${task.action}`].join(' '),
    title: task.title,
    description: task.description,
    iconPath: target.execPath,
    iconIndex: 0,
  }));
}

const REAPPLY_INTERVAL_MS = 60_000;

/** Writes PawOS's tasks now and keeps them in place. Windows only; a no-op elsewhere. Never throws. */
export function installJumpList(app: App, target: JumpListTarget): void {
  if (process.platform !== 'win32') return;
  const apply = () => {
    try {
      app.setUserTasks(buildJumpTasks(target));
    } catch (error) {
      console.error('[jumpList] could not set tasks:', error instanceof Error ? error.message : error);
    }
  };
  apply();
  const timer = setInterval(apply, REAPPLY_INTERVAL_MS);
  timer.unref?.();
  app.on('browser-window-focus', apply);
}
