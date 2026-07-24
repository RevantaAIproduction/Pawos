import * as crypto from 'crypto';
import { runCli, readLocalSshPublicKey, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real Linode (Akamai) connector. Provisions via the official `linode-cli`
 * (`linode-cli configure` must already be run). Linode's create API accepts
 * an inline `authorized_keys` value directly — no pre-registered key needed,
 * unlike DigitalOcean/Vultr/Hetzner — so this reads the same local SSH
 * public key every other connector here uses. Linode's API still requires a
 * root password even when authorized_keys is set; this connector generates
 * one at random per provision (never logged, never the real access path —
 * the SSH key is) purely to satisfy that API requirement.
 */
export class LinodeConnector extends VmProvisioningConnector {
  readonly id = 'linode' as const;
  readonly displayName = 'Linode';

  constructor(
    private label: string | undefined,
    private region: string = 'us-east',
    private type: string = 'g6-nanode-1',
    private image: string = 'linode/ubuntu22.04',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'root'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.label);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Linode is not configured. Set LINODE_LABEL, and make sure `linode-cli configure` has been run.' };
  }

  async provision(): Promise<ProvisionResult> {
    const key = readLocalSshPublicKey();
    if (!key.ok) return key;
    const rootPass = crypto.randomBytes(24).toString('base64');

    const create = await runCli('linode-cli', [
      'linodes', 'create',
      '--type', this.type,
      '--region', this.region,
      '--image', this.image,
      '--label', this.label as string,
      '--root_pass', rootPass,
      '--authorized_keys', key.publicKey,
      '--json',
    ], 10 * 60 * 1000);
    if (!create.ok) return { ok: false, reason: `linode-cli linodes create failed: ${create.message}` };

    let instanceId: number;
    try {
      const data = JSON.parse(create.stdout) as Array<{ id: number; ipv4?: string[] }>;
      const first = data[0];
      if (!first) return { ok: false, reason: 'linode-cli linodes create returned no instance.' };
      instanceId = first.id;
      if (first.ipv4?.[0]) return { ok: true, instanceId: String(instanceId), publicIp: first.ipv4[0], region: this.region, size: this.type };
    } catch {
      return { ok: false, reason: 'Could not parse linode-cli linodes create output.' };
    }

    // Networking sometimes isn't attached in the create response yet — poll the instance briefly.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const view = await runCli('linode-cli', ['linodes', 'view', String(instanceId), '--json'], 30000);
      if (!view.ok) continue;
      try {
        const data = JSON.parse(view.stdout) as Array<{ ipv4?: string[] }>;
        const ip = data[0]?.ipv4?.[0];
        if (ip) return { ok: true, instanceId: String(instanceId), publicIp: ip, region: this.region, size: this.type };
      } catch {
        // try again
      }
    }
    return { ok: false, reason: `Linode ${instanceId} was created but never reported an IPv4 address in time.` };
  }
}
