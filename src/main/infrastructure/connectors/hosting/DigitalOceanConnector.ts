import { runCli, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real DigitalOcean connector. Provisions a Droplet via the official
 * `doctl` CLI (`doctl auth init` must already be run — same
 * already-authenticated-CLI trust boundary as every other connector here).
 * `--wait` blocks until the Droplet is active, and `--format ID,PublicIPv4
 * --no-header` returns exactly the two fields this connector needs in one
 * call — no separate describe step required. Requires an SSH key already
 * uploaded to your DigitalOcean account (`doctl compute ssh-key create` or
 * the DO dashboard) — doctl's droplet create takes a key ID/fingerprint,
 * not an inline public key, so this connector never invents one.
 */
export class DigitalOceanConnector extends VmProvisioningConnector {
  readonly id = 'digitalOcean' as const;
  readonly displayName = 'DigitalOcean';

  constructor(
    private dropletName: string | undefined,
    private sshKeyId: string | undefined, // DO ssh-key ID or fingerprint, already registered on the account
    private region: string = 'nyc3',
    private size: string = 's-1vcpu-1gb',
    private image: string = 'ubuntu-22-04-x64',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'root'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.dropletName && this.sshKeyId);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'DigitalOcean is not configured. Set DIGITALOCEAN_DROPLET_NAME and DIGITALOCEAN_SSH_KEY_ID (an SSH key already added to your DO account), and make sure `doctl auth init` has been run.' };
  }

  async provision(): Promise<ProvisionResult> {
    const args = [
      'compute', 'droplet', 'create', this.dropletName as string,
      '--region', this.region,
      '--size', this.size,
      '--image', this.image,
      '--ssh-keys', this.sshKeyId as string,
      '--wait',
      '--format', 'ID,PublicIPv4',
      '--no-header',
    ];
    const create = await runCli('doctl', args, 10 * 60 * 1000);
    if (!create.ok) return { ok: false, reason: `doctl compute droplet create failed: ${create.message}` };
    const parts = create.stdout.split(/\s+/).filter(Boolean);
    const [instanceId, publicIp] = parts;
    if (!instanceId || !publicIp) return { ok: false, reason: `Could not parse doctl droplet create output: "${create.stdout}"` };
    return { ok: true, instanceId, publicIp, region: this.region, size: this.size };
  }
}
