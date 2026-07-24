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
 * independent of which PawOS account is signed in. Local-only by design
 * (see src/renderer/sessions/DeviceSessionsService.ts for why the cross-
 * device *list* of sessions lives in Supabase instead): no other device
 * ever needs to read this file before it's uploaded as a row there.
 */
class DeviceIdentityStore {
  private filePath = '';
  private identity: LocalDeviceIdentity | null = null;

  init(): void {
    const dir = path.join(app.getPath('userData'), FOLDER_NAME);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, FILE_NAME);
    try {
      this.identity = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      this.identity = {
        deviceId: crypto.randomUUID(),
        deviceName: os.hostname(),
        platform: process.platform,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(this.identity, null, 2), 'utf-8');
    }
  }

  getIdentity(): LocalDeviceIdentity {
    if (!this.identity) this.init();
    return this.identity!;
  }
}

export const deviceIdentityStore = new DeviceIdentityStore();
