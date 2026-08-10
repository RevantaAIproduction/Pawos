import { exec } from 'child_process';
import type { CommandShell } from '../../shared/actions/ActionTypes';
import { getRefreshedEnv } from './envRefresh';
import { withShell } from './plugins/shellCommand';

export type ShellExecResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

/**
 * Shared shell-command execution — extracted from RunCommandPlugin so the Validation Pipeline's
 * lint/typecheck/test runners (Coding Runtime V2 §12) can run a real command the same way
 * RunCommandPlugin always has, rather than duplicating the env-refresh/timeout/maxBuffer setup a
 * second time. Behavior is unchanged from RunCommandPlugin's original inline version — this is a
 * pure extraction-for-reuse, not a redesign.
 */
export async function execShellCommand(command: string, cwd: string, shell?: CommandShell, timeoutMs = 45_000): Promise<ShellExecResult> {
  // Refreshed env — a PATH/env change from earlier in this same conversation
  // (setPathEntry, setEnvironmentVariable, installTool) must be visible to
  // the very next command, not just after an app restart. See envRefresh.ts.
  const env = await getRefreshedEnv();
  return new Promise((resolve) => {
    const child = exec(withShell(command, shell), { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 4, env }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error as unknown as { code?: number }).code ?? 1 : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        timedOut: Boolean(error && (error as unknown as { killed?: boolean; signal?: string }).signal === 'SIGTERM'),
      });
    });
    void child;
  });
}
