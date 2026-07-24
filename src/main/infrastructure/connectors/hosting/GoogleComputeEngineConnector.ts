import * as os from 'os';
import { runCli, readLocalSshPublicKey, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real Google Compute Engine (raw VM) connector — distinct from
 * GoogleCloudRunConnector, which deploys a container to the managed Cloud
 * Run service instead. Provisions a plain VM via the already-authenticated
 * `gcloud` CLI, injects the user's own local SSH public key into instance
 * metadata (GCE's real, documented mechanism for adding SSH access without
 * OS Login), then deploys over SSH + Docker like every other VM connector.
 */
export class GoogleComputeEngineConnector extends VmProvisioningConnector {
  readonly id = 'googleComputeEngine' as const;
  readonly displayName = 'Google Compute Engine';

  constructor(
    private instanceName: string | undefined,
    private projectId: string | undefined,
    private zone: string = 'us-central1-a',
    private machineType: string = 'e2-medium',
    private imageFamily: string = 'ubuntu-2204-lts',
    private imageProject: string = 'ubuntu-os-cloud',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = os.userInfo().username
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.instanceName && this.projectId);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Google Compute Engine is not configured. Set GCE_INSTANCE_NAME and GCP_PROJECT_ID, and make sure `gcloud auth login` has been run.' };
  }

  async provision(): Promise<ProvisionResult> {
    const key = readLocalSshPublicKey();
    if (!key.ok) return key;

    const args = [
      'compute', 'instances', 'create', this.instanceName as string,
      '--project', this.projectId as string,
      '--zone', this.zone,
      '--machine-type', this.machineType,
      '--image-family', this.imageFamily,
      '--image-project', this.imageProject,
      '--metadata', `ssh-keys=${this.sshUser}:${key.publicKey}`,
      '--format', 'json',
    ];
    const create = await runCli('gcloud', args);
    if (!create.ok) return { ok: false, reason: `gcloud compute instances create failed: ${create.message}` };
    try {
      const data = JSON.parse(create.stdout) as Array<{ id: string; networkInterfaces?: Array<{ accessConfigs?: Array<{ natIP?: string }> }> }>;
      const instance = data[0];
      if (!instance) return { ok: false, reason: 'gcloud compute instances create returned no instance.' };
      const publicIp = instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
      if (!publicIp) return { ok: false, reason: `Instance ${this.instanceName} was created but has no external IP (check that it wasn't created with --no-address).` };
      return { ok: true, instanceId: instance.id, publicIp, region: this.zone, size: this.machineType };
    } catch {
      return { ok: false, reason: 'Could not parse gcloud compute instances create output.' };
    }
  }
}
