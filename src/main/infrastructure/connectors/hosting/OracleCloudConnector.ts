import { runCli, readLocalSshPublicKey, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real Oracle Cloud Infrastructure (OCI) connector. Provisions via the
 * official `oci` CLI (`oci setup config` must already be run), which is the
 * most identifier-heavy of every provider here by OCI's own design —
 * launching an instance genuinely requires an availability domain,
 * compartment OCID, shape, image OCID, and subnet OCID, all of which this
 * connector takes as configuration rather than guessing or simplifying
 * away. The SSH public key is injected via OCI's real
 * `ssh_authorized_keys` instance-metadata mechanism (the same local key
 * every other SSH-based connector here uses), so no separate OCI key
 * resource needs to be pre-registered. Because `oci compute instance
 * launch` doesn't return a public IP directly (that lives on the attached
 * VNIC), this connector polls the instance to RUNNING and then reads the
 * IP from `oci compute instance list-vnics`.
 */
export class OracleCloudConnector extends VmProvisioningConnector {
  readonly id = 'oracleCloud' as const;
  readonly displayName = 'Oracle Cloud Infrastructure';

  constructor(
    private displayNameArg: string | undefined,
    private availabilityDomain: string | undefined,
    private compartmentId: string | undefined,
    private subnetId: string | undefined,
    private imageId: string | undefined,
    private shape: string = 'VM.Standard.E2.1.Micro',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'opc'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.displayNameArg && this.availabilityDomain && this.compartmentId && this.subnetId && this.imageId);
  }

  notConfigured(): { ok: false; reason: string } {
    return {
      ok: false,
      reason: 'Oracle Cloud is not configured. Set OCI_INSTANCE_NAME, OCI_AVAILABILITY_DOMAIN, OCI_COMPARTMENT_ID, OCI_SUBNET_ID, and OCI_IMAGE_ID, and make sure `oci setup config` has been run.',
    };
  }

  async provision(): Promise<ProvisionResult> {
    const key = readLocalSshPublicKey();
    if (!key.ok) return key;

    const launch = await runCli('oci', [
      'compute', 'instance', 'launch',
      '--availability-domain', this.availabilityDomain as string,
      '--compartment-id', this.compartmentId as string,
      '--shape', this.shape,
      '--image-id', this.imageId as string,
      '--subnet-id', this.subnetId as string,
      '--display-name', this.displayNameArg as string,
      '--metadata', JSON.stringify({ ssh_authorized_keys: key.publicKey }),
      '--wait-for-state', 'RUNNING',
    ], 10 * 60 * 1000);
    if (!launch.ok) return { ok: false, reason: `oci compute instance launch failed: ${launch.message}` };

    let instanceId: string;
    try {
      const data = JSON.parse(launch.stdout) as { data?: { id?: string } };
      if (!data.data?.id) return { ok: false, reason: 'oci compute instance launch returned no instance id.' };
      instanceId = data.data.id;
    } catch {
      return { ok: false, reason: 'Could not parse oci compute instance launch output.' };
    }

    const vnics = await runCli('oci', ['compute', 'instance', 'list-vnics', '--instance-id', instanceId]);
    if (!vnics.ok) return { ok: false, reason: `oci compute instance list-vnics failed: ${vnics.message}` };
    try {
      const data = JSON.parse(vnics.stdout) as { data?: Array<{ 'public-ip'?: string }> };
      const publicIp = data.data?.[0]?.['public-ip'];
      if (!publicIp) return { ok: false, reason: `Instance ${instanceId} is running but has no public IP on its primary VNIC.` };
      return { ok: true, instanceId, publicIp, size: this.shape };
    } catch {
      return { ok: false, reason: 'Could not parse oci compute instance list-vnics output.' };
    }
  }
}
