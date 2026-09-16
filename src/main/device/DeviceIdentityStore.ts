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
function getHardwareFingerprint(): string {
  let hardwareData = '';
  const nets = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (!net.internal && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }
  hardwareData += os.hostname() + '|' + os.arch() + '|' + os.platform() + '|' + mac;

  let machineId = '';
  try {
    if (process.platform === 'win32') {
      machineId = require('child_process').execSync('reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf-8' }).match(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/)?.[0] || '';
    } else if (process.platform === 'darwin') {
      machineId = require('child_process').execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', { encoding: 'utf-8' }).match(/"([^"]+)"/)?.[1] || '';
    } else {
      machineId = require('child_process').execSync('cat /etc/machine-id', { encoding: 'utf-8' }).trim();
    }
  } catch (e) {}

  if (machineId) {
    hardwareData += '|' + machineId;
  }

  return crypto.createHash('sha256').update(hardwareData).digest('hex');
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
        this.identity!.deviceHash = getHardwareFingerprint();
        dirty = true;
      }
    } catch {
      this.identity = {
        deviceId: crypto.randomUUID(),
        deviceHash: getHardwareFingerprint(),
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
