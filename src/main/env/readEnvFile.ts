import * as fs from 'fs';
import * as path from 'path';

/**
 * Minimal .env parser (KEY=VALUE per line, '#' comments, optional quotes) —
 * no dependency needed for something this small. Checked in two places so
 * it works both for a packaged install (drop a .env next to PawOS.exe) and
 * for a dev checkout (.env at the repo root, cwd when running `electron .`).
 */
function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export function readEnvFile(candidateDirs: string[]): Record<string, string> {
  for (const dir of candidateDirs) {
    const filePath = path.join(dir, '.env');
    try {
      if (fs.existsSync(filePath)) {
        return parseEnvFile(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch {
      // unreadable — try the next candidate rather than failing startup over it
    }
  }
  return {};
}
