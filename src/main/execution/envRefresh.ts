import { execFile } from 'child_process';

/**
 * Node captures process.env once at startup. [Environment]::
 * SetEnvironmentVariable('User', ...) (setPathEntry, setEnvironmentVariable)
 * persists a change to the registry but does NOT update this long-running
 * process's in-memory env, and any child spawned without an explicit env
 * override inherits that same stale snapshot — so a PATH/JAVA_HOME change
 * made moments earlier could make the very next verification call in the
 * same conversation turn wrongly report "not installed." A real, brand-new
 * Command Prompt doesn't have this problem because it reads the registry
 * fresh at creation; this reproduces that for a single spawned command by
 * reading Machine+User env straight from the registry (short-cached to
 * avoid spawning PowerShell once per check in a burst) and merging it over
 * process.env. Generic — not tool-specific; benefits verifying any
 * just-installed/just-configured tool (Python, Node, Docker, Java, ...).
 */
const CACHE_TTL_MS = 2_000;
let cached: { env: NodeJS.ProcessEnv; expiresAt: number } | null = null;

function readMachineAndUserEnv(): Promise<Record<string, string>> {
  const script = [
    "$m = [Environment]::GetEnvironmentVariables('Machine');",
    "$u = [Environment]::GetEnvironmentVariables('User');",
    "$combined = @{};",
    "foreach ($k in $m.Keys) { $combined[$k] = $m[$k] }",
    "foreach ($k in $u.Keys) {",
    "  if ($k -ieq 'Path' -and $combined.ContainsKey('Path')) {",
    "    $combined['Path'] = $combined['Path'].TrimEnd(';') + ';' + $u[$k]",
    "  } else {",
    "    $combined[$k] = $u[$k]",
    "  }",
    "}",
    "$combined | ConvertTo-Json -Compress",
  ].join(' ');

  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10_000 }, (error, stdout) => {
      if (error) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || '{}') as Record<string, string>);
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Merges process.env with a fresh registry read of Machine+User env — the
 * equivalent of "open a new terminal" for a single spawned command.
 *
 * Windows env var names are case-insensitive, but a plain JS object isn't —
 * `process.env`'s own PATH key on this process may be `PATH` while
 * PowerShell's `ConvertTo-Json` of `[Environment]::GetEnvironmentVariables()`
 * comes back as `Path`. A naive `{...process.env, ...fresh}` spread leaves
 * BOTH as separate keys in the object; when that's handed to
 * `child_process`'s `env` option, Windows' CreateProcess receives two
 * case-variant PATH entries and resolves using the stale one, silently
 * discarding the refreshed value. Confirmed directly: this produced "java
 * isn't installed" even though the fresh registry read genuinely included
 * the right directory. Fixed by dropping any existing case-variant key
 * before applying the fresh value, so only one casing of each name survives.
 */
export async function getRefreshedEnv(): Promise<NodeJS.ProcessEnv> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.env;

  const fresh = await readMachineAndUserEnv();
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(fresh)) {
    for (const existingKey of Object.keys(merged)) {
      if (existingKey !== key && existingKey.toUpperCase() === key.toUpperCase()) {
        delete merged[existingKey];
      }
    }
    merged[key] = fresh[key];
  }
  cached = { env: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}
