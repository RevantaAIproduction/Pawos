import { execFile } from 'child_process';

/**
 * Writes PATH entries / environment variables to real Windows System
 * (Machine/HKLM) scope by default — "leave the computer correctly
 * configured," not scoped so narrowly it doesn't actually work for the
 * rest of the system. Machine scope needs administrator rights; this never
 * silently downgrades to User scope on its own. It tries un-elevated first
 * (works immediately if the process already has admin rights), and only
 * requests a real UAC prompt when genuinely required. If elevation isn't
 * granted (declined, times out, or unavailable in a non-interactive
 * session), the caller gets an honest failure describing the two real
 * choices — retry elevated, or settle for User scope — rather than a
 * silent fallback. The caller re-invokes with `preferredScope: 'user'` to
 * explicitly choose that path once the user has actually decided.
 *
 * Generic: works for any variable name/PATH entry — JAVA_HOME, PYTHONHOME,
 * ANDROID_HOME, or a PATH addition — no per-tool logic.
 */

export type ScopeWriteResult =
  | { ok: true; scope: 'machine' | 'user'; elevated: boolean; alreadySet: boolean }
  | { ok: false; message: string; needsDecision?: boolean };

const ELEVATION_TIMEOUT_MS = 60_000;

function runPowerShell(script: string, envVars: Record<string, string>, timeoutMs = 10_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, env: { ...process.env, ...envVars } },
      (error, stdout, stderr) => {
        const code = error ? ((error as unknown as { code?: number }).code ?? 1) : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

/** try/catch + explicit stdout markers — never a bare "Command failed" with no explanation. */
function markerScript(kind: 'var' | 'path'): string {
  const setLogic =
    kind === 'var'
      ? [
          "$name = $env:PAWOS_ENV_NAME; $value = $env:PAWOS_ENV_VALUE;",
          "$current = [Environment]::GetEnvironmentVariable($name, $env:PAWOS_ENV_SCOPE);",
          "if ($current -eq $value) { Write-Output 'ALREADY_SET'; exit 0 }",
          "[Environment]::SetEnvironmentVariable($name, $value, $env:PAWOS_ENV_SCOPE);",
          "Write-Output 'SET';",
        ]
      : [
          "$entry = $env:PAWOS_ENV_VALUE;",
          "$current = [Environment]::GetEnvironmentVariable('Path', $env:PAWOS_ENV_SCOPE);",
          "if ($current -split ';' -contains $entry) { Write-Output 'ALREADY_SET'; exit 0 }",
          "[Environment]::SetEnvironmentVariable('Path', ($current.TrimEnd(';') + ';' + $entry), $env:PAWOS_ENV_SCOPE);",
          "Write-Output 'SET';",
        ];
  return [
    'try {',
    ...setLogic,
    '} catch {',
    "  Write-Output ('ACCESS_DENIED:' + $_.Exception.Message)",
    '}',
  ].join(' ');
}

async function attemptDirectWrite(kind: 'var' | 'path', scope: 'Machine' | 'User', name: string, value: string): Promise<ScopeWriteResult> {
  const result = await runPowerShell(markerScript(kind), { PAWOS_ENV_NAME: name, PAWOS_ENV_VALUE: value, PAWOS_ENV_SCOPE: scope });
  const out = result.stdout.trim();
  if (out === 'SET') return { ok: true, scope: scope === 'Machine' ? 'machine' : 'user', elevated: false, alreadySet: false };
  if (out === 'ALREADY_SET') return { ok: true, scope: scope === 'Machine' ? 'machine' : 'user', elevated: false, alreadySet: true };
  if (out.startsWith('ACCESS_DENIED:')) return { ok: false, message: out.slice('ACCESS_DENIED:'.length).trim(), needsDecision: scope === 'Machine' };
  const detail = [out, result.stderr.trim()].filter(Boolean).join(' — ');
  return { ok: false, message: detail || `PowerShell exited with code ${result.code} and produced no output.` };
}

/**
 * Spawns a NEW elevated PowerShell process via a real UAC prompt. Since
 * exit codes don't reliably cross the elevation boundary with
 * `Start-Process -Verb RunAs`, success is confirmed by re-reading the
 * Machine-scope value afterward and comparing it to what was requested —
 * the same "don't trust it, verify it" discipline used everywhere else in
 * this runtime. Bounded to ELEVATION_TIMEOUT_MS so a UAC prompt nobody can
 * answer (a non-interactive session, or the user simply not responding)
 * fails fast into the honest decision-required path instead of hanging.
 */
async function attemptElevatedWrite(kind: 'var' | 'path', name: string, value: string): Promise<boolean> {
  const inner = markerScript(kind).replace(/'/g, "''");
  const launcher = [
    '$p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -PassThru',
    `-ArgumentList '-NoProfile','-NonInteractive','-Command','${inner}'`,
    '-ErrorAction SilentlyContinue;',
  ].join(' ');
  await runPowerShell(launcher, { PAWOS_ENV_NAME: name, PAWOS_ENV_VALUE: value, PAWOS_ENV_SCOPE: 'Machine' }, ELEVATION_TIMEOUT_MS);

  const check = await runPowerShell(
    kind === 'var'
      ? "[Environment]::GetEnvironmentVariable($env:PAWOS_ENV_NAME, 'Machine')"
      : "[Environment]::GetEnvironmentVariable('Path', 'Machine')",
    { PAWOS_ENV_NAME: name },
    10_000
  );
  return kind === 'var' ? check.stdout.trim() === value : check.stdout.split(';').map((s) => s.trim()).includes(value);
}

const DECISION_MESSAGE = (what: string) =>
  `I need administrator permission to configure Windows system ${what} — I couldn't get it. I can either retry with administrator permission, or configure it only for your Windows account. Which would you like?`;

async function setScoped(
  kind: 'var' | 'path',
  name: string,
  value: string,
  opts: { preferredScope?: 'machine' | 'user' }
): Promise<ScopeWriteResult> {
  if (opts.preferredScope === 'user') {
    return attemptDirectWrite(kind, 'User', name, value);
  }

  const direct = await attemptDirectWrite(kind, 'Machine', name, value);
  if (direct.ok || !direct.needsDecision) return direct;

  const elevated = await attemptElevatedWrite(kind, name, value);
  if (elevated) return { ok: true, scope: 'machine', elevated: true, alreadySet: false };

  return { ok: false, message: DECISION_MESSAGE(kind === 'var' ? 'environment variables' : 'PATH') };
}

export function setSystemEnvVar(name: string, value: string, opts: { preferredScope?: 'machine' | 'user' } = {}): Promise<ScopeWriteResult> {
  return setScoped('var', name, value, opts);
}

export function addSystemPathEntry(entry: string, opts: { preferredScope?: 'machine' | 'user' } = {}): Promise<ScopeWriteResult> {
  return setScoped('path', '', entry, opts);
}
