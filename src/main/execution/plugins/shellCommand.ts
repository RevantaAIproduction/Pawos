import type { CommandShell } from '../../../shared/actions/ActionTypes';

/**
 * Builds the effective command string RunCommandPlugin/ProcessManager
 * actually hand to the OS-default shell (cmd.exe on Windows, still the
 * outer invoker in every case). Rather than swapping Node's own `shell`
 * spawn/exec option per shell — which has inconsistent argument-quoting
 * behavior across shells — this wraps the requested shell as the program
 * cmd.exe launches, so both call sites get identical, predictable
 * behavior from one helper. Omitted or 'cmd' returns `command` unchanged,
 * matching today's behavior exactly.
 */
export function withShell(command: string, shell?: CommandShell): string {
  if (!shell || shell === 'cmd') return command;
  const escaped = command.replace(/"/g, '\\"');
  if (shell === 'powershell') return `powershell -NoProfile -NonInteractive -Command "${escaped}"`;
  return `bash -lc "${escaped}"`; // gitbash
}
