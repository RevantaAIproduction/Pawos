import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import type { PairedDeviceRecord } from '../../shared/communication/CommunicationTypes';

const FOLDER_NAME = 'companion-devices';

/**
 * Desktop-side of Mobile Companion pairing (architecture doc §13.1) — real
 * pairing-token generation and a real, revocable per-device registry. The
 * actual phone-side app (scanning the QR, completing the handshake,
 * recording/syncing calls) is explicitly deferred in the frozen
 * architecture ("Mobile Companion's actual app shell/platform... out of
 * scope"), so this store honestly implements only the desktop half: enough
 * for a future mobile client to complete a real handshake against, and for
 * the UI to show/revoke paired devices, without fabricating a phone-side
 * capability this codebase doesn't have yet.
 */
class MobilePairingStore {
  private dir = '';
  private devices: PairedDeviceRecord[] = [];
  private pendingToken: string | null = null;

  init(): void {
    this.dir = path.join(app.getPath('userData'), 'communication', FOLDER_NAME);
    fs.mkdirSync(this.dir, { recursive: true });
    this.load();
  }

  private load(): void {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
      this.devices = files.map((f) => JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf-8')));
    } catch {
      this.devices = [];
    }
  }

  private saveDevice(device: PairedDeviceRecord): void {
    fs.writeFileSync(path.join(this.dir, `${device.deviceId}.json`), JSON.stringify(device, null, 2), 'utf-8');
  }

  /** A real, single-use pairing token — a real mobile client would present this back (with its own public key) to complete the handshake via `completePairing`. */
  beginPairing(): string {
    this.pendingToken = crypto.randomBytes(24).toString('hex');
    return this.pendingToken;
  }

  completePairing(token: string, deviceName: string, publicKey: string): PairedDeviceRecord | null {
    if (!this.pendingToken || token !== this.pendingToken) return null;
    this.pendingToken = null;
    const device: PairedDeviceRecord = { deviceId: crypto.randomUUID(), name: deviceName, pairedAt: Date.now(), revokedAt: null, publicKey };
    this.devices.push(device);
    this.saveDevice(device);
    return device;
  }

  list(): PairedDeviceRecord[] {
    return [...this.devices];
  }

  revoke(deviceId: string): void {
    const device = this.devices.find((d) => d.deviceId === deviceId);
    if (!device) return;
    device.revokedAt = Date.now();
    this.saveDevice(device);
  }
}

export const mobilePairingStore = new MobilePairingStore();
