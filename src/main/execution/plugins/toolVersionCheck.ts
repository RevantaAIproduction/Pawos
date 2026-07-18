import { execFile } from 'child_process';
import { getRefreshedEnv } from '../envRefresh';

/**
 * Shared by VerifyToolInstalledPlugin and InstallToolPlugin's post-install
 * check — see VerifyToolInstalledPlugin for why this allowlists command
 * SHAPE rather than specific program names. Includes single-dash `-version`
 * alongside `--version`/`-v` — the classic JVM-ecosystem convention (java,
 * javac, javap, jar all predate the `--version` GNU-style long option;
 * `-version` still works even on modern JDKs) as well as several other
 * real-world CLIs (mvn, ant). Not tool-specific: any program that happens
 * to use this exact flag shape benefits.
 */
export const SAFE_VERSION_COMMAND = /^([\w.\-]+)\s+(--version|-version|-v|-V|--help|version)$/i;

type ShellResult = { ok: boolean; output: string };

/**
 * A single fresh-shell spawn — cmd.exe or powershell.exe — with the freshly
 * re-read Machine+User environment (see envRefresh.ts), not this
 * long-running process's stale inherited env. This is the scriptable
 * equivalent of "open a NEW Command Prompt / PowerShell and check" from a
 * generic install runtime's perspective — no per-tool logic, any program
 * benefits.
 */
async function runInShell(shell: 'cmd' | 'powershell', program: string, flag: string, env: NodeJS.ProcessEnv): Promise<ShellResult> {
  return new Promise((resolve) => {
    if (shell === 'cmd') {
      // shell:true on Windows spawns via cmd.exe /d /s /c — needed to resolve
      // .cmd/.bat shims (how most globally-installed npm CLIs actually
      // resolve; plain execFile only finds real .exe binaries).
      execFile(program, [flag], { timeout: 10_000, shell: true, env }, (error, stdout, stderr) => {
        resolve(error ? { ok: false, output: '' } : { ok: true, output: (stdout || stderr).trim().slice(0, 500) });
      });
    } else {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', `${program} ${flag}`], { timeout: 10_000, env }, (error, stdout, stderr) => {
        resolve(error ? { ok: false, output: '' } : { ok: true, output: (stdout || stderr).trim().slice(0, 500) });
      });
    }
  });
}

/**
 * Verifies from two genuinely separate fresh shell processes — cmd.exe and
 * powershell.exe — not just one, since PATH resolution can (rarely, but
 * really) differ between them. VS Code's own integrated terminal spawns one
 * of these same two shells under the hood, so a pass here is functionally
 * equivalent to a pass there too; this project doesn't have a way to read
 * VS Code's terminal buffer directly, so that's not separately automated.
 * Both shells must succeed to report success — if only one does, the
 * failure message says exactly which one didn't, real diagnostic detail
 * instead of a bare "not installed."
 */
export async function runToolVersionCheck(command: string): Promise<{ ok: true; output: string } | { ok: false; message: string }> {
  const match = command.trim().match(SAFE_VERSION_COMMAND);
  if (!match) return { ok: false, message: `"${command}" isn't a recognized "<program> <version-flag>" check.` };
  const program = match[1] ?? '';
  const flag = match[2] ?? '--version';
  const env = await getRefreshedEnv();

  const [cmdResult, psResult] = await Promise.all([runInShell('cmd', program, flag, env), runInShell('powershell', program, flag, env)]);

  if (cmdResult.ok && psResult.ok) {
    return { ok: true, output: cmdResult.output || psResult.output };
  }
  if (!cmdResult.ok && !psResult.ok) {
    return { ok: false, message: `"${program}" doesn't appear to be installed (or isn't on PATH) — checked in a fresh Command Prompt and a fresh PowerShell.` };
  }
  const workingShell = cmdResult.ok ? 'Command Prompt' : 'PowerShell';
  const failingShell = cmdResult.ok ? 'PowerShell' : 'Command Prompt';
  return { ok: false, message: `"${program}" works in a fresh ${workingShell} but not in a fresh ${failingShell} — PATH is inconsistent between them.` };
}
