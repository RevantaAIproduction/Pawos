import { execFile } from 'child_process';
import * as path from 'path';
import type { EvidenceCaptureRequest, EvidenceProviderAvailability } from '../../../shared/evidence/EvidenceTypes';
import { failed, unavailable, type EvidenceProvider, type ProviderCapture } from '../EvidenceProvider';

type ExecResult = { ok: boolean; stdout: Buffer; stderr: string };
export type AdbRunner = (args: string[], timeoutMs?: number) => Promise<ExecResult>;

/** adb on PATH, else the Android SDK's platform-tools (ANDROID_HOME / ANDROID_SDK_ROOT / the default SDK folder). */
function adbCandidates(): string[] {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined]
    .filter((root): root is string => Boolean(root));
  return ['adb', ...roots.map((root) => path.join(root, 'platform-tools', exe))];
}

function runFile(file: string, args: string[], timeoutMs = 20_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(file, args, { encoding: 'buffer', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout as Buffer, stderr: String(stderr ?? '') || (error ? error.message : '') });
    });
  });
}

/** Finds a working adb once; null when none is installed. */
async function defaultAdbRunner(): Promise<AdbRunner | null> {
  for (const candidate of adbCandidates()) {
    const probe = await runFile(candidate, ['version'], 5_000);
    if (probe.ok) return (args, timeoutMs) => runFile(candidate, args, timeoutMs);
  }
  return null;
}

/** "emulator-5554\tdevice" lines from `adb devices` — only ready devices (not offline/unauthorized). */
export function parseAdbDevices(output: string): string[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]!);
}

/**
 * An Android emulator's or USB device's screen via adb (`exec-out screencap -p`). Detects adb and a
 * ready device first; without them it reports "unavailable" — a ticket never fails over it.
 */
export class AndroidEvidenceProvider implements EvidenceProvider {
  readonly id = 'android' as const;

  constructor(private readonly findAdb: () => Promise<AdbRunner | null> = defaultAdbRunner) {}

  private async devices(adb: AdbRunner): Promise<string[]> {
    const listed = await adb(['devices']);
    return listed.ok ? parseAdbDevices(listed.stdout.toString('utf8')) : [];
  }

  async availability(): Promise<EvidenceProviderAvailability> {
    const adb = await this.findAdb();
    if (!adb) return { provider: 'android', available: false, verified: false, detail: 'adb (Android SDK platform-tools) is not installed.' };
    const devices = await this.devices(adb);
    return devices.length > 0
      ? { provider: 'android', available: true, verified: false, detail: `Ready: ${devices.join(', ')}.` }
      : { provider: 'android', available: false, verified: false, detail: 'adb is installed but no emulator or device is connected.' };
  }

  async capture(request: EvidenceCaptureRequest): Promise<ProviderCapture> {
    if (request.target.provider !== 'android') return failed('Not an Android target.');
    const adb = await this.findAdb();
    if (!adb) return unavailable('Android screenshots need adb (Android SDK platform-tools), which is not installed.');
    const devices = await this.devices(adb);
    if (devices.length === 0) return unavailable('No Android emulator or device is connected.');
    const serial = request.target.serial ?? (devices.length === 1 ? devices[0]! : null);
    if (!serial) return failed(`Several devices are connected (${devices.join(', ')}) — say which one.`);
    if (!devices.includes(serial)) return unavailable(`Device ${serial} is not connected.`);

    const shot = await adb(['-s', serial, 'exec-out', 'screencap', '-p'], 30_000);
    const pngSignature = shot.stdout.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    if (!shot.ok || !pngSignature) return failed(`adb couldn't capture the screen: ${shot.stderr || 'no image returned'}`);
    return { ok: true, targetDescription: `Android ${serial}`, image: shot.stdout };
  }
}
