import { execFile } from 'child_process';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 1024 * 1024 * 4;

/**
 * Shared by every git plugin — always execFile with an args array (never a
 * shell string), so nothing here has a shell-injection surface regardless
 * of branch names, commit messages, or file paths involved.
 */
export function runGit(args: string[], cwd: string): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: DEFAULT_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: stderr?.trim() || error.message });
      } else {
        resolve({ ok: true, stdout });
      }
    });
  });
}
