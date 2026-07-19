import { execFile } from 'child_process';

/** Same execFile-with-args-array discipline as runGit.ts — never a shell string, zero injection surface. Used only for read-only detection probes. */
export function execCli(command: string, args: string[], timeoutMs = 8000): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, stderr: (stderr || error.message).trim() });
        return;
      }
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}
