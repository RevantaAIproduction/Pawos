import { runCli, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real Hetzner Cloud connector. Provisions via the official `hcloud` CLI
 * (`hcloud context create` must already be run). `hcloud server create`'s
 * own output isn't reliably structured, so this connector creates by name
 * and then immediately calls `hcloud server describe <name> -o json` (which
 * does support JSON) to read back the real id and IPv4 address, rather than
 * parsing fragile create-command text. Requires an SSH key already
 * registered on the Hetzner account (`hcloud ssh-key create` or the
 * console) — hcloud's create takes a key name/ID, not an inline public key.
 */
export class HetznerConnector extends VmProvisioningConnector {
  readonly id = 'hetzner' as const;
  readonly displayName = 'Hetzner Cloud';

  constructor(
    private serverName: string | undefined,
    private sshKeyName: string | undefined,
    private location: string = 'nbg1',
    private serverType: string = 'cx22',
    private image: string = 'ubuntu-22.04',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'root'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.serverName && this.sshKeyName);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Hetzner Cloud is not configured. Set HETZNER_SERVER_NAME and HETZNER_SSH_KEY_NAME (an SSH key already added to your Hetzner account), and make sure `hcloud context create` has been run.' };
  }

  async provision(): Promise<ProvisionResult> {
    const create = await runCli('hcloud', [
      'server', 'create',
      '--name', this.serverName as string,
      '--type', this.serverType,
      '--image', this.image,
      '--location', this.location,
      '--ssh-key', this.sshKeyName as string,
    ], 5 * 60 * 1000);
    if (!create.ok) return { ok: false, reason: `hcloud server create failed: ${create.message}` };

    const describe = await runCli('hcloud', ['server', 'describe', this.serverName as string, '-o', 'json']);
    if (!describe.ok) return { ok: false, reason: `Server "${this.serverName}" was created but hcloud server describe failed: ${describe.message}` };
    try {
      const data = JSON.parse(describe.stdout) as { id?: number; public_net?: { ipv4?: { ip?: string } } };
      const publicIp = data.public_net?.ipv4?.ip;
      if (!data.id || !publicIp) return { ok: false, reason: `hcloud server describe for "${this.serverName}" had no id/public IPv4.` };
      return { ok: true, instanceId: String(data.id), publicIp, region: this.location, size: this.serverType };
    } catch {
      return { ok: false, reason: 'Could not parse hcloud server describe output.' };
    }
  }
}
