import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type ProvisionedInstance = {
  providerId: string;
  instanceId: string;
  publicIp: string;
  region?: string;
  size?: string;
  createdAt: string;
};

const FOLDER_NAME = 'infrastructure';
const FILE_NAME = 'provisioned-instances.json';

/**
 * Remembers the one VM PawOS has provisioned per cloud-VM connector (EC2,
 * Compute Engine, Azure VM, DigitalOcean, Linode, Vultr, Hetzner, OCI,
 * Hostinger VPS), so a second deploy() call redeploys to the same
 * already-running instance instead of provisioning a new one every time —
 * the same "one instance, one target" simplicity DockerVpsConnector already
 * assumes for a manually-provided host, just persisted across restarts for
 * providers that provision the host on Paw's own behalf.
 */
class ProvisionedInstanceStore {
  private filePath = '';
  private instances: Record<string, ProvisionedInstance> = {};

  init(): void {
    const dir = path.join(app.getPath('userData'), FOLDER_NAME);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, FILE_NAME);
    try {
      this.instances = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      this.instances = {};
    }
  }

  get(providerId: string): ProvisionedInstance | undefined {
    return this.instances[providerId];
  }

  set(instance: ProvisionedInstance): void {
    this.instances[instance.providerId] = instance;
    this.persist();
  }

  clear(providerId: string): void {
    delete this.instances[providerId];
    this.persist();
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.instances, null, 2), 'utf-8');
  }
}

export const provisionedInstanceStore = new ProvisionedInstanceStore();
