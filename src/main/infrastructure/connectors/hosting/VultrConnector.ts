import { runCli, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

type VultrInstance = { id?: string; main_ip?: string };

function extractInstance(json: string): VultrInstance | undefined {
  try {
    const data = JSON.parse(json) as VultrInstance | { instance?: VultrInstance };
    return 'instance' in data ? data.instance : (data as VultrInstance);
  } catch {
    return undefined;
  }
}

/**
 * Real Vultr connector. Provisions via the official `vultr-cli`
 * (`vultr-cli` must already have an API key configured). Requires an SSH
 * key already registered on the Vultr account (`vultr-cli ssh-key create`
 * or the dashboard) — like DigitalOcean, Vultr's instance create takes a
 * key ID, not an inline public key.
 */
export class VultrConnector extends VmProvisioningConnector {
  readonly id = 'vultr' as const;
  readonly displayName = 'Vultr';

  constructor(
    private hostname: string | undefined,
    private sshKeyId: string | undefined,
    private region: string = 'ewr',
    private plan: string = 'vc2-1c-1gb',
    private osId: string = '1743', // Ubuntu 22.04 x64 at time of writing; override via VULTR_OS_ID if it changes
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'root'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.hostname && this.sshKeyId);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Vultr is not configured. Set VULTR_HOSTNAME and VULTR_SSH_KEY_ID (an SSH key already added to your Vultr account), and make sure vultr-cli has an API key configured.' };
  }

  async provision(): Promise<ProvisionResult> {
    const create = await runCli('vultr-cli', [
      'instance', 'create',
      '--region', this.region,
      '--plan', this.plan,
      '--os', this.osId,
      '--host', this.hostname as string,
      '--label', this.hostname as string,
      '--ssh-keys', this.sshKeyId as string,
      '-o', 'json',
    ], 10 * 60 * 1000);
    if (!create.ok) return { ok: false, reason: `vultr-cli instance create failed: ${create.message}` };

    const instance = extractInstance(create.stdout);
    if (!instance?.id) return { ok: false, reason: `Could not parse vultr-cli instance create output: "${create.stdout.slice(0, 300)}"` };
    if (instance.main_ip && instance.main_ip !== '0.0.0.0') {
      return { ok: true, instanceId: instance.id, publicIp: instance.main_ip, region: this.region, size: this.plan };
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const get = await runCli('vultr-cli', ['instance', 'get', instance.id, '-o', 'json'], 30000);
      if (!get.ok) continue;
      const polled = extractInstance(get.stdout);
      if (polled?.main_ip && polled.main_ip !== '0.0.0.0') {
        return { ok: true, instanceId: instance.id, publicIp: polled.main_ip, region: this.region, size: this.plan };
      }
    }
    return { ok: false, reason: `Vultr instance ${instance.id} was created but never reported a main IP in time.` };
  }
}
