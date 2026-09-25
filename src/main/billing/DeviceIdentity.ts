import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

let cached: string | null = null;

/** The operating system's own install id — survives deleting PawOS's files and reinstalling PawOS. */
function readOsMachineId(): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 5000,
      });
      const match = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(out);
      return match?.[1] ? match[1].toLowerCase() : null;
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf-8', timeout: 5000 });
      const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out);
      return match?.[1] ? match[1].toLowerCase() : null;
    }
    for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      if (fs.existsSync(file)) {
        const id = fs.readFileSync(file, 'utf-8').trim();
        if (id) return id.toLowerCase();
      }
    }
  } catch {
    // fall through to the stored id
  }
  return null;
}

/** Last resort when the OS id can't be read: a random id kept in the app's data folder (weaker). */
function storedFallbackId(): string {
  const file = path.join(app.getPath('userData'), 'billing', 'device-id');
  try {
    const existing = fs.readFileSync(file, 'utf-8').trim();
    if (existing) return existing;
  } catch {
    // create below
  }
  const id = randomUUID();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, id, 'utf-8');
  } catch {
    // in-memory only
  }
  return id;
}

/**
 * A stable, anonymous fingerprint of this computer: SHA-256 of the OS machine id (Windows
 * MachineGuid, macOS IOPlatformUUID, Linux machine-id). The raw id never leaves the device. Keys the
 * server copy of the free Paw Go usage ledger, so deleting PawOS's local files — or signing up with
 * a new email — doesn't reset the free allowance on this PC.
 */
export function deviceFingerprint(): string {
  if (cached) return cached;
  const raw = readOsMachineId() ?? `fallback:${storedFallbackId()}`;
  cached = createHash('sha256').update(`pawos-device-v1:${raw}`).digest('hex');
  return cached;
}
