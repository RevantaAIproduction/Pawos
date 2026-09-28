import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { EvidenceCaptureRequest, EvidenceProviderAvailability } from '../../../shared/evidence/EvidenceTypes';
import { failed, unavailable, type EvidenceProvider, type ProviderCapture } from '../EvidenceProvider';

type Run = (args: string[], timeoutMs?: number) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

const xcrun: Run = (args, timeoutMs = 20_000) =>
  new Promise((resolve) => {
    execFile('xcrun', args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (error ? error.message : '') });
    });
  });

/** Booted simulators from `xcrun simctl list devices booted -j`. */
export function parseBootedSimulators(json: string): { udid: string; name: string }[] {
  try {
    const parsed = JSON.parse(json) as { devices?: Record<string, { udid: string; name: string; state: string }[]> };
    return Object.values(parsed.devices ?? {})
      .flat()
      .filter((device) => device.state === 'Booted')
      .map((device) => ({ udid: device.udid, name: device.name }));
  } catch {
    return [];
  }
}

const UNVERIFIED = 'Implemented for macOS (xcrun simctl) but not yet verified by PawOS on a Mac.';

/**
 * A booted iOS Simulator's screen via `xcrun simctl io <udid> screenshot`. Apple's tooling exists only on
 * macOS: on Windows/Linux this reports "implemented but environment unavailable/unverified" and never
 * fails the ticket.
 */
export class IosSimulatorEvidenceProvider implements EvidenceProvider {
  readonly id = 'iosSimulator' as const;

  constructor(private readonly platform: NodeJS.Platform = process.platform, private readonly run: Run = xcrun) {}

  async availability(): Promise<EvidenceProviderAvailability> {
    if (this.platform !== 'darwin') {
      return { provider: 'iosSimulator', available: false, verified: false, detail: `Implemented but environment unavailable/unverified: iOS Simulator runs only on macOS (this is ${this.platform}).` };
    }
    const listed = await this.run(['simctl', 'list', 'devices', 'booted', '-j']);
    if (!listed.ok) return { provider: 'iosSimulator', available: false, verified: false, detail: `Xcode command-line tools not available: ${listed.stderr}` };
    const booted = parseBootedSimulators(listed.stdout);
    return booted.length > 0
      ? { provider: 'iosSimulator', available: true, verified: false, detail: `${UNVERIFIED} Booted: ${booted.map((d) => d.name).join(', ')}.` }
      : { provider: 'iosSimulator', available: false, verified: false, detail: 'No iOS Simulator is booted.' };
  }

  async capture(request: EvidenceCaptureRequest): Promise<ProviderCapture> {
    const target = request.target;
    if (target.provider !== 'iosSimulator') return failed('Not an iOS Simulator target.');
    if (this.platform !== 'darwin') return unavailable(`iOS Simulator screenshots are implemented but unavailable here: they need macOS (this is ${this.platform}).`);
    const listed = await this.run(['simctl', 'list', 'devices', 'booted', '-j']);
    if (!listed.ok) return unavailable(`Xcode command-line tools not available: ${listed.stderr}`);
    const booted = parseBootedSimulators(listed.stdout);
    if (booted.length === 0) return unavailable('No iOS Simulator is booted.');
    const device = target.udid ? booted.find((d) => d.udid === target.udid) : booted.length === 1 ? booted[0] : undefined;
    if (!device) return failed(target.udid ? `Simulator ${target.udid} is not booted.` : `Several simulators are booted — say which one.`);

    const file = path.join(os.tmpdir(), `pawos-ios-${Date.now()}.png`);
    const shot = await this.run(['simctl', 'io', device.udid, 'screenshot', file], 30_000);
    if (!shot.ok || !fs.existsSync(file)) return failed(`simctl couldn't capture the screen: ${shot.stderr}`);
    const image = fs.readFileSync(file);
    fs.rmSync(file, { force: true });
    return { ok: true, targetDescription: `iOS Simulator ${device.name}`, image };
  }
}
