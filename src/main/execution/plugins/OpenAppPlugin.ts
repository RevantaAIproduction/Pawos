import { exec } from 'child_process';
import type { ActionRequest, ActionResult, KnownAppId } from '../../../shared/actions/ActionTypes';
import type { PrepareResult } from '../DesktopPlugin';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { waitForOsProcess } from '../verification/ProcessVerification';
import { resourceManager } from '../ResourceManager';

/** Image names checkable via tasklist — only apps where "did it actually launch" is worth confirming beyond the shell command's own exit code. */
const VERIFIABLE_APP_PROCESSES: Partial<Record<KnownAppId, string>> = {
  vscode: 'Code.exe',
  cursor: 'Cursor.exe',
  visualstudio: 'devenv.exe',
  intellij: 'idea64.exe',
  androidstudio: 'studio64.exe',
  notepad: 'notepad.exe',
};

// IDE CLI launchers (cursor/idea/studio) assume the user has set up that
// app's own "install shell command" — same assumption VS Code's `code`
// command already made; not something Paw can silently configure itself.
const KNOWN_APP_COMMANDS: Record<KnownAppId, string> = {
  vscode: 'code',
  cursor: 'cursor',
  visualstudio: 'start devenv',
  intellij: 'idea',
  androidstudio: 'studio',
  chrome: 'start chrome',
  edge: 'start msedge',
  explorer: 'explorer',
  notepad: 'notepad',
  terminal: 'start wt',
};

const APP_LABELS: Record<KnownAppId, string> = {
  vscode: 'VS Code',
  cursor: 'Cursor',
  visualstudio: 'Visual Studio',
  intellij: 'IntelliJ IDEA',
  androidstudio: 'Android Studio',
  chrome: 'Chrome',
  edge: 'Edge',
  explorer: 'File Explorer',
  notepad: 'Notepad',
  terminal: 'the terminal',
};

// Double quotes can't appear in a Windows path at all, so simply wrapping in
// quotes (not further escaping) is safe here — cmd.exe treats the whole
// quoted string as one literal argument, including any & | ; characters inside it.
function quotePath(p: string): string {
  return `"${p}"`;
}

/** Only apps where "open at this path" is a real, well-defined command — chrome/edge opening "at a path" doesn't mean anything, so they're not here. */
const PATH_COMMANDS: Partial<Record<KnownAppId, (path: string) => string>> = {
  vscode: (p) => `code ${quotePath(p)}`,
  cursor: (p) => `cursor ${quotePath(p)}`,
  visualstudio: (p) => `devenv ${quotePath(p)}`,
  intellij: (p) => `idea ${quotePath(p)}`,
  androidstudio: (p) => `studio ${quotePath(p)}`,
  notepad: (p) => `notepad ${quotePath(p)}`,
  explorer: (p) => `explorer ${quotePath(p)}`,
  terminal: (p) => `start wt -d ${quotePath(p)}`,
};

function execCommand(command: string): Promise<ActionResult> {
  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) resolve({ ok: false, reason: 'failed', message: error.message });
      else resolve({ ok: true });
    });
  });
}

export class OpenAppPlugin extends BasePlugin {
  id = 'openApp';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'openApp';
  }

  /**
   * "If VS Code is already open, reuse it" — only for a generic open (no
   * specific path/project, so any existing window satisfies the request)
   * and only for apps with a known process image name to check against.
   */
  async prepare(request: ActionRequest): Promise<PrepareResult> {
    if (request.type !== 'openApp' || request.path) return { requirements: [] };
    const imageName = VERIFIABLE_APP_PROCESSES[request.appId];
    if (!imageName) return { requirements: [] };

    const alreadyRunning = await resourceManager.isAppRunning(imageName);
    if (!alreadyRunning) return { requirements: [] };
    return { requirements: [], reuse: { ok: true, data: { reused: true } } };
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'openApp') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const command = request.path ? PATH_COMMANDS[request.appId]?.(request.path) : undefined;
    return execCommand(command ?? KNOWN_APP_COMMANDS[request.appId]);
  }

  /**
   * The `code`/`notepad` shell commands return as soon as they've handed
   * off to the real app and launch asynchronously — a clean exit code only
   * proves the command ran, not that the app actually opened. Only checked
   * for apps with a well-known process image name; everything else keeps
   * BasePlugin's honest "nothing further to verify" default.
   */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'openApp' || !result.ok) return result;
    const imageName = VERIFIABLE_APP_PROCESSES[request.appId];
    if (!imageName) return result;

    const launched = await waitForOsProcess(imageName, { timeoutMs: 10_000 });
    if (!launched) {
      return { ok: false, reason: 'failed', message: `The command ran, but I never saw ${imageName} actually start.` };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'openApp') return 'Working on that…';
    return request.path
      ? `Opening ${APP_LABELS[request.appId]} at ${request.path}…`
      : `Opening ${APP_LABELS[request.appId]}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type !== 'openApp') return 'Done.';
    const reused = (result.data as { reused?: boolean } | undefined)?.reused;
    if (reused) return `${APP_LABELS[request.appId]} was already open, so I'm using that.`;
    return request.path
      ? `I've opened ${APP_LABELS[request.appId]} at ${request.path}.`
      : `I've opened ${APP_LABELS[request.appId]}.`;
  }
}

export const openAppPlugin = new OpenAppPlugin();
