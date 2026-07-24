import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCli, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real Azure VM connector — distinct from a future Azure App Service
 * connector, which would target the managed PaaS instead of a raw VM.
 * Provisions via the already-authenticated `az` CLI. `az vm create` returns
 * the public IP directly in its JSON output, so unlike AWS/GCP this needs no
 * separate describe call. Ensures the resource group exists first (a real,
 * idempotent, free operation — `az group create` no-ops if it already
 * exists), then creates the VM with an SSH public key rather than a
 * password, using the same local key every other SSH-based connector uses
 * when present, or letting `az` generate one otherwise.
 */
export class AzureVmConnector extends VmProvisioningConnector {
  readonly id = 'azureVm' as const;
  readonly displayName = 'Azure VM';

  constructor(
    private vmName: string | undefined,
    private resourceGroup: string | undefined,
    private location: string = 'eastus',
    private vmSize: string = 'Standard_B2s',
    private image: string = 'Ubuntu2204',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'azureuser'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.vmName && this.resourceGroup);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Azure VM is not configured. Set AZURE_VM_NAME and AZURE_RESOURCE_GROUP, and make sure `az login` has been run.' };
  }

  async provision(): Promise<ProvisionResult> {
    const ensureGroup = await runCli('az', ['group', 'create', '--name', this.resourceGroup as string, '--location', this.location, '--output', 'json']);
    if (!ensureGroup.ok) return { ok: false, reason: `az group create failed: ${ensureGroup.message}` };

    const args = [
      'vm', 'create',
      '--resource-group', this.resourceGroup as string,
      '--name', this.vmName as string,
      '--image', this.image,
      '--size', this.vmSize,
      '--admin-username', this.sshUser,
      '--output', 'json',
    ];
    const pubKeyPath = path.join(os.homedir(), '.ssh', 'id_ed25519.pub');
    const rsaKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa.pub');
    if (fs.existsSync(pubKeyPath)) args.push('--ssh-key-values', pubKeyPath);
    else if (fs.existsSync(rsaKeyPath)) args.push('--ssh-key-values', rsaKeyPath);
    else args.push('--generate-ssh-keys');

    const create = await runCli('az', args, 10 * 60 * 1000);
    if (!create.ok) return { ok: false, reason: `az vm create failed: ${create.message}` };
    try {
      const data = JSON.parse(create.stdout) as { id?: string; publicIpAddress?: string };
      if (!data.publicIpAddress) return { ok: false, reason: `VM ${this.vmName} was created but az vm create returned no publicIpAddress.` };
      return { ok: true, instanceId: data.id ?? (this.vmName as string), publicIp: data.publicIpAddress, region: this.location, size: this.vmSize };
    } catch {
      return { ok: false, reason: 'Could not parse az vm create output.' };
    }
  }
}
