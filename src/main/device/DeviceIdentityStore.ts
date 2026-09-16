import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { app } from 'electron';
import type { LocalDeviceIdentity } from '../../shared/device/DeviceTypes';

const FOLDER_NAME = 'device';
const FILE_NAME = 'identity.json';

/**
 * This one device's own identity — generated once and persisted forever,
 * independent of which PawOS account is signed in. Local-only by design.
 * We no longer collect invasive hardware fingerprints (MAC, MachineGuid).
 * Server limits the number of devices registered per user to prevent spoofing.
 */
function generateDeviceId(): string {
  return crypto.randomUUID();
}

class DeviceIdentityStore {
  private filePath = '';
  private identity: LocalDeviceIdentity | null = null;

  init(): void {
    const dir = path.join(app.getPath('userData'), FOLDER_NAME);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, FILE_NAME);
    let dirty = false;
    try {
      this.identity = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (!this.identity?.deviceHash) {
        // Keep deviceHash for compatibility, but just use deviceId
        this.identity!.deviceHash = this.identity!.deviceId;
        dirty = true;
      }
    } catch {
      const newId = generateDeviceId();
      this.identity = {
        deviceId: newId,
        deviceHash: newId, // Same as deviceId now
        deviceName: os.hostname(),
        platform: process.platform,
      };
      dirty = true;
    }
    if (dirty) {
      fs.writeFileSync(this.filePath, JSON.stringify(this.identity, null, 2), 'utf-8');
    }
  }

  getIdentity(): LocalDeviceIdentity {
    if (!this.identity) this.init();
    return this.identity!;
  }
}

export const deviceIdentityStore = new DeviceIdentityStore();
