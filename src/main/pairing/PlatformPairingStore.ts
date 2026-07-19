import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import QRCode from 'qrcode';
import type { PairedDevice, PairingSessionInfo } from '../../shared/pairing/PairingTypes';

const FOLDER_NAME = 'pairing';
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

type PendingSession = { token: string; expiresAt: number; userId?: string };

/**
 * Generic, runtime-agnostic device pairing — QR-code generation, a
 * single-use expiring pairing token, and a persisted per-device registry
 * with revoke support. Deliberately separate from
 * src/main/communication/MobilePairingStore.ts (the frozen Communication
 * Runtime's own pairing plumbing) so this can be built and used by any
 * future PawOS surface without touching frozen code; when the
 * Communication Runtime is unfrozen, it can migrate to this shared
 * registry instead of keeping its own.
 *
 * No mobile client exists in this codebase to actually complete a real
 * handshake — completePairing() is real, working code a future client
 * would call, exercised in the meantime only via direct testing.
 */
class PlatformPairingStore {
  private dir = '';
  private devices: PairedDevice[] = [];
  private pending: PendingSession | null = null;

  init(): void {
    this.dir = path.join(app.getPath('userData'), FOLDER_NAME, 'devices');
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

  private saveDevice(device: PairedDevice): void {
    fs.writeFileSync(path.join(this.dir, `${device.deviceId}.json`), JSON.stringify(device, null, 2), 'utf-8');
  }

  async beginPairing(userId?: string): Promise<PairingSessionInfo> {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    this.pending = { token, expiresAt, userId };

    const pairingUri = `pawos-pair://v1?token=${token}`;
    const qrDataUrl = await QRCode.toDataURL(pairingUri, { margin: 1, width: 320 });
    return { token, pairingUri, qrDataUrl, expiresAt };
  }

  /**
   * A real future mobile client calls this with the scanned token plus its
   * own generated name/public key. Single-use and expiring, same discipline
   * as the password-reset token (see src/main/mail/passwordResetToken.ts).
   */
  completePairing(token: string, deviceName: string, publicKey: string): { ok: true; device: PairedDevice } | { ok: false; reason: string } {
    if (!this.pending) return { ok: false, reason: 'No pairing session is open.' };
    if (Date.now() > this.pending.expiresAt) {
      this.pending = null;
      return { ok: false, reason: 'This pairing code has expired.' };
    }
    if (token !== this.pending.token) return { ok: false, reason: 'Invalid pairing code.' };

    const { userId } = this.pending;
    this.pending = null;
    const now = Date.now();
    const device: PairedDevice = {
      deviceId: crypto.randomUUID(),
      name: deviceName,
      publicKey,
      userId,
      pairedAt: now,
      lastSeenAt: now,
      status: 'active',
      revokedAt: null,
    };
    this.devices.push(device);
    this.saveDevice(device);
    return { ok: true, device };
  }

  list(userId?: string): PairedDevice[] {
    const all = [...this.devices];
    return userId ? all.filter((d) => d.userId === userId) : all;
  }

  revoke(deviceId: string): void {
    const device = this.devices.find((d) => d.deviceId === deviceId);
    if (!device) return;
    device.status = 'revoked';
    device.revokedAt = Date.now();
    this.saveDevice(device);
  }
}

export const platformPairingStore = new PlatformPairingStore();
