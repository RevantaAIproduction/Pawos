import { execFile } from 'child_process';
import * as os from 'os';
import { processManager } from '../ProcessManager';
import { waitForExit, waitForOsProcess } from '../verification/ProcessVerification';
import { getRefreshedEnv } from '../envRefresh';
import { runToolVersionCheck } from './toolVersionCheck';
import type { SoftwareManager, SoftwareDetectionResult } from '../../../shared/actions/SoftwareTypes';

/** Generous — some installers (JDKs, Docker Desktop, IDEs) are large downloads. */
const RUN_TIMEOUT_MS = 8 * 60 * 1000;

/** Package ids/names only — no shell metacharacters, so interpolating one into a shell command string (ProcessManager spawns with shell:true) can't smuggle a second command. */
export const SAFE_PACKAGE_ID = /^[\w.\-@/]+$/;
/** Looser than SAFE_PACKAGE_ID (paths need spaces/colons/backslashes) but still blocks every shell metacharacter that could chain a second command. */
export const SAFE_LAUNCH_COMMAND = /^[^&|;`$()<>]+$/;

async function execFileP(
  cmd: string,
  args: string[],
  timeoutMs = 30_000
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  // Refreshed env — a package/PATH change made moments earlier (by this same
  // install flow) must be visible to the very next detection/verification
  // call, not just to a future restart. See envRefresh.ts.
  const env = await getRefreshedEnv();
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, shell: true, maxBuffer: 1024 * 1024 * 4, env }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a package is already installed — one query per manager, generic
 * across ANY package for that manager. This is the honest, no-per-app-data
 * detection the whole runtime falls back on when the caller doesn't supply
 * a more specific executableHint/verifyCommand.
 */
export async function detectSoftware(manager: SoftwareManager, packageId: string): Promise<SoftwareDetectionResult> {
  switch (manager) {
    case 'winget': {
      const result = await execFileP('winget', ['list', '--id', packageId, '--accept-source-agreements']);
      const text = `${result.stdout}\n${result.stderr}`;
      if (/No installed package found/i.test(text)) return { installed: false, raw: text.slice(0, 300) };
      const shortName = packageId.split('.').pop() ?? packageId;
      if (result.ok && text.toLowerCase().includes(shortName.toLowerCase())) {
        const versionMatch = text.match(/\b(\d+(?:\.\d+){1,3})\b/);
        return { installed: true, version: versionMatch?.[1], raw: text.slice(0, 300) };
      }
      return { installed: false, raw: text.slice(0, 300) };
    }
    case 'npm': {
      const result = await execFileP('npm', ['list', '-g', packageId, '--depth=0']);
      const versionMatch = `${result.stdout}\n${result.stderr}`.match(new RegExp(`${escapeForRegex(packageId)}@([\\w.\\-]+)`));
      return { installed: Boolean(versionMatch), version: versionMatch?.[1], raw: result.stdout.slice(0, 300) };
    }
    case 'pip': {
      const result = await execFileP('pip', ['show', packageId]);
      const versionMatch = result.stdout.match(/^Version:\s*(.+)$/m);
      return { installed: result.ok && Boolean(versionMatch), version: versionMatch?.[1]?.trim(), raw: result.stdout.slice(0, 300) };
    }
    case 'code-extension': {
      const result = await execFileP('code', ['--list-extensions', '--show-versions']);
      const versionMatch = result.stdout.match(new RegExp(`${escapeForRegex(packageId)}@([\\w.\\-]+)`, 'i'));
      return { installed: Boolean(versionMatch), version: versionMatch?.[1], raw: result.stdout.slice(0, 300) };
    }
    default:
      return { installed: false };
  }
}

/**
 * winget gets a two-shot strategy: exact --id match first (precise, given a
 * real winget id), then a fallback treating the same string as a plain
 * search term/name (winget resolves well-known names like "python"/"git"
 * this way too) — no per-application data, just how winget itself already
 * supports being invoked.
 */
function wingetCommand(operation: 'install' | 'repair' | 'update' | 'uninstall', packageId: string, opts: { asName?: boolean } = {}): string {
  const idPart = opts.asName ? packageId : `--id ${packageId} --exact`;
  switch (operation) {
    case 'install':
      return `winget install ${idPart} --silent --accept-package-agreements --accept-source-agreements`;
    case 'repair':
      return `winget install ${idPart} --silent --accept-package-agreements --accept-source-agreements --force`;
    case 'update':
      return `winget upgrade --id ${packageId} --silent --accept-package-agreements --accept-source-agreements`;
    case 'uninstall':
      return `winget uninstall --id ${packageId} --silent`;
  }
}

export function buildCommand(
  manager: SoftwareManager,
  operation: 'install' | 'update' | 'uninstall' | 'repair',
  packageId: string,
  opts: { asName?: boolean } = {}
): string | null {
  switch (manager) {
    case 'winget':
      return wingetCommand(operation, packageId, opts);
    case 'npm':
      if (operation === 'install') return `npm install -g ${packageId}`;
      if (operation === 'repair') return `npm install -g ${packageId} --force`;
      if (operation === 'update') return `npm update -g ${packageId}`;
      if (operation === 'uninstall') return `npm uninstall -g ${packageId}`;
      return null;
    case 'pip':
      if (operation === 'install') return `pip install ${packageId}`;
      if (operation === 'repair') return `pip install --force-reinstall ${packageId}`;
      if (operation === 'update') return `pip install --upgrade ${packageId}`;
      if (operation === 'uninstall') return `pip uninstall -y ${packageId}`;
      return null;
    case 'code-extension':
      if (operation === 'install') return `code --install-extension ${packageId}`;
      if (operation === 'repair' || operation === 'update') return `code --install-extension ${packageId} --force`;
      if (operation === 'uninstall') return `code --uninstall-extension ${packageId}`;
      return null;
    default:
      return null;
  }
}

/** Runs a manager command through ProcessManager (installs/updates can take minutes, not RunCommandPlugin's 45s) and waits for it to finish. */
export async function runManagedCommand(command: string, label: string): Promise<{ ok: true; output: string } | { ok: false; message: string }> {
  const startResult = await processManager.start(command, os.homedir(), label);
  if (!startResult.ok) return { ok: false, message: startResult.message };

  const exitResult = await waitForExit(startResult.info.id, { timeoutMs: RUN_TIMEOUT_MS });
  if (!exitResult.ok) return { ok: false, message: exitResult.message };

  const output = processManager.getOutput(startResult.info.id, 4000);
  const tail = output.ok ? output.output : '';
  if (exitResult.exitCode !== 0) {
    return { ok: false, message: `Exited with code ${exitResult.exitCode}.${tail ? ` ${tail.trim().slice(-500)}` : ''}` };
  }
  return { ok: true, output: tail };
}

/** Reuses the same safe-shape "<program> --version" check already used by verifyToolInstalled. */
export async function verifyExecutable(name: string): Promise<{ ok: true; output: string } | { ok: false; message: string }> {
  return runToolVersionCheck(`${name} --version`);
}

/**
 * For GUI apps — launches via a caller-supplied command and confirms a real
 * NEW OS process with the given image name actually appears, rather than
 * trusting that the launch command merely exited without error.
 */
export async function verifyLaunch(launchCommand: string, expectedProcessName: string, timeoutMs = 15_000): Promise<boolean> {
  const env = await getRefreshedEnv();
  execFile('cmd.exe', ['/c', 'start', '""', launchCommand], { env }, () => {});
  return waitForOsProcess(expectedProcessName, { timeoutMs });
}
