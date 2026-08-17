import spawn from 'cross-spawn';
import type { CommandShell } from '../../shared/actions/ActionTypes';
import { getRefreshedEnv } from './envRefresh';
import { resolveSafeInvocation } from './plugins/commandSafety';

export type ShellExecResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

/** Matches the previous exec() maxBuffer ceiling (4MB), applied per-stream here since spawn has no single combined-buffer option. */
const MAX_OUTPUT_CHARS = 1024 * 1024 * 4;

/**
 * Shared, safe command execution — extracted from RunCommandPlugin so the Validation Pipeline's
 * lint/typecheck/test runners (Coding Runtime V2 §12) can run a real command the same way
 * RunCommandPlugin always has, rather than duplicating the env-refresh/timeout/maxBuffer setup a
 * second time.
 *
 * SECURITY (P0-1): every command is resolved to a concrete {bin, args} invocation via
 * resolveSafeInvocation() (see commandSafety.ts for the full rationale) — never a raw string handed
 * to a shell. Execution goes through cross-spawn with shell:false, which also correctly and safely
 * handles Windows .cmd/.bat targets (npm/npx/yarn/pnpm) without the spawn(...,{shell:true}) escape
 * hatch the previous implementation relied on for those.
 */
export async function execShellCommand(command: string, cwd: string, shell?: CommandShell, timeoutMs = 45_000): Promise<ShellExecResult> {
  const resolved = resolveSafeInvocation(command, shell);
  if (!resolved.ok) {
    return { code: null, stdout: '', stderr: resolved.message, timedOut: false };
  }

  // Refreshed env — a PATH/env change from earlier in this same conversation
  // (setPathEntry, setEnvironmentVariable, installTool) must be visible to
  // the very next command, not just after an app restart. See envRefresh.ts.
  const env = await getRefreshedEnv();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(resolved.invocation.bin, resolved.invocation.args, { cwd, env, windowsHide: true });
    } catch (error) {
      resolve({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error), timedOut: false });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout = (stdout + data.toString()).slice(-MAX_OUTPUT_CHARS);
    });
    child.stderr?.on('data', (data) => {
      stderr = (stderr + data.toString()).slice(-MAX_OUTPUT_CHARS);
    });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: stderr || error.message, timedOut: false });
    });
    child.once('close', (code) => finish(code));
  });
}
