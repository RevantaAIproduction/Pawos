import * as fs from 'fs';
import { execFile } from 'child_process';

/**
 * Real installed-executable detection — Windows only for now. The Browser
 * Runtime itself never contains this kind of OS-specific path knowledge;
 * it lives here, inside the platform layer each adapter calls into, so a
 * future macOS/Linux port only means adding candidate paths here, never
 * touching BrowserRuntime or any adapter's automation logic.
 */

const WIN_CANDIDATES: Record<'chrome' | 'edge' | 'brave' | 'firefox', string[]> = {
  chrome: [
    `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
  edge: [
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
  brave: [
    `${process.env['PROGRAMFILES']}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    `${process.env['LOCALAPPDATA']}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
  ],
  firefox: [`${process.env['PROGRAMFILES']}\\Mozilla Firefox\\firefox.exe`, `${process.env['PROGRAMFILES(X86)']}\\Mozilla Firefox\\firefox.exe`],
};

const WHERE_NAMES: Record<'chrome' | 'edge' | 'brave' | 'firefox', string> = {
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  brave: 'brave.exe',
  firefox: 'firefox.exe',
};

const WMIC_IMAGE_NAMES: Record<'chrome' | 'edge' | 'brave', string> = {
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  brave: 'brave.exe',
};

function listProcessCommandLines(imageName: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'wmic',
      ['process', 'where', `name='${imageName}'`, 'get', 'commandline'],
      { timeout: 8000 },
      (error, stdout) => {
        if (error) return resolve([]);
        resolve(
          stdout
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && l.toLowerCase() !== 'commandline')
        );
      }
    );
  });
}

/** Is this browser running at all right now, regardless of how it was launched? */
export async function isBrowserRunning(browser: 'chrome' | 'edge' | 'brave'): Promise<boolean> {
  const lines = await listProcessCommandLines(WMIC_IMAGE_NAMES[browser]);
  return lines.length > 0;
}

/**
 * Looks for an ALREADY-RUNNING instance of this browser that happens to
 * have been launched with --remote-debugging-port (e.g. a previous Paw
 * session, or a user who enabled it themselves) — genuine session reuse
 * without spawning anything new. Verifies the port is actually live, not
 * just present in a stale command line. Returns null if the browser isn't
 * running, or is running without remote debugging enabled — there is no
 * way to turn on CDP for a browser process after the fact.
 */
export async function findExistingDebugPort(browser: 'chrome' | 'edge' | 'brave'): Promise<number | null> {
  const lines = await listProcessCommandLines(WMIC_IMAGE_NAMES[browser]);
  const ports = new Set<number>();
  for (const line of lines) {
    const match = line.match(/--remote-debugging-port=(\d+)/);
    if (match && match[1]) ports.add(Number(match[1]));
  }
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return port;
    } catch {
      // that port isn't actually live — keep checking others
    }
  }
  return null;
}

function whereExecutable(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('where', [name], { timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(null);
      const first = stdout.split(/\r?\n/).find((line) => line.trim());
      resolve(first ? first.trim() : null);
    });
  });
}

const cache = new Map<string, string | null>();

/** Resolves the real executable path for a browser — checks well-known install locations first, falls back to PATH via `where`. Cached per process lifetime (install locations don't change mid-session). */
export async function resolveBrowserExecutable(browser: 'chrome' | 'edge' | 'brave' | 'firefox'): Promise<string | null> {
  if (cache.has(browser)) return cache.get(browser) ?? null;

  for (const candidate of WIN_CANDIDATES[browser]) {
    if (candidate && fs.existsSync(candidate)) {
      cache.set(browser, candidate);
      return candidate;
    }
  }

  const fromPath = await whereExecutable(WHERE_NAMES[browser]);
  cache.set(browser, fromPath);
  return fromPath;
}

const REAL_PROFILE_DIRS: Record<'chrome' | 'edge' | 'brave', string> = {
  chrome: `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\User Data`,
  edge: `${process.env['LOCALAPPDATA']}\\Microsoft\\Edge\\User Data`,
  brave: `${process.env['LOCALAPPDATA']}\\BraveSoftware\\Brave-Browser\\User Data`,
};

/**
 * The user's REAL default profile directory — used only for the
 * explicitly-gated "reuse my existing session" flow. Deliberately never
 * used for ordinary automation, which stays on Paw's own isolated
 * `--user-data-dir` (see ChromiumCdpAdapter) precisely so it never has
 * access to real saved passwords/autofill/logins unless the user
 * specifically asked Paw to use the browser they're already logged into.
 */
export function resolveRealProfileDir(browser: 'chrome' | 'edge' | 'brave'): string {
  return REAL_PROFILE_DIRS[browser];
}
