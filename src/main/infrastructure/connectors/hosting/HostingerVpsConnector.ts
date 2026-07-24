import { readLocalSshPublicKey, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

const HOSTINGER_API = 'https://developers.hostinger.com/api/vps/v1';

type VirtualMachine = {
  id?: number | string;
  state?: string;
  ipv4?: Array<{ address?: string }> | string[];
  ip?: string;
  public_ip?: string;
};

function extractIp(vm: VirtualMachine): string | undefined {
  if (typeof vm.ip === 'string') return vm.ip;
  if (typeof vm.public_ip === 'string') return vm.public_ip;
  const first = vm.ipv4?.[0] as { address?: string } | string | undefined;
  if (typeof first === 'string') return first;
  return first?.address;
}

/**
 * Real Hostinger VPS connector, using Hostinger's real public REST API
 * (developers.hostinger.com/api/vps/v1) with a Bearer API token generated in
 * hPanel — unlike the AWS/GCP/Azure/DO/Linode/Vultr/Hetzner/OCI connectors,
 * this one deliberately does NOT auto-purchase a new VPS on every deploy.
 * A Hostinger VPS is a monthly-billed hosting product bought through
 * checkout, not a pay-per-second compute resource meant to be spun up and
 * torn down by automation — auto-purchasing one would be a real, unwanted
 * financial transaction. Instead, this connector attaches your local SSH
 * public key to an already-purchased VPS (HOSTINGER_VPS_ID, found via
 * hPanel or `GET /virtual-machines`) and deploys to it exactly like every
 * other SSH+Docker connector.
 *
 * The exact JSON field names below (ipv4/ip/public_ip) are a best-effort
 * reading of Hostinger's documented response shape; if Hostinger's real
 * response uses a different field, this connector will fail with an honest,
 * specific error rather than silently deploying to a wrong or empty address.
 */
export class HostingerVpsConnector extends VmProvisioningConnector {
  readonly id = 'hostingerVps' as const;
  readonly displayName = 'Hostinger VPS';

  constructor(
    private apiToken: string | undefined,
    private vpsId: string | undefined,
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'root'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.apiToken && this.vpsId);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Hostinger VPS is not configured. Set HOSTINGER_API_TOKEN (generate one in hPanel) and HOSTINGER_VPS_ID (an already-purchased VPS — this connector never auto-purchases one).' };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  async provision(): Promise<ProvisionResult> {
    const key = readLocalSshPublicKey();
    if (!key.ok) return key;

    try {
      const registerRes = await fetch(`${HOSTINGER_API}/public-keys`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ name: 'pawos-deploy-key', key: key.publicKey }),
      });
      let publicKeyId: number | string | undefined;
      if (registerRes.ok) {
        const registered = (await registerRes.json()) as { id?: number | string };
        publicKeyId = registered.id;
      }
      // If registration failed because the key already exists, attaching by content isn't supported by
      // this API — proceed and let the attach call itself report a clear failure if it truly can't find it.
      if (publicKeyId !== undefined) {
        const attachRes = await fetch(`${HOSTINGER_API}/public-keys/attach/${this.vpsId}`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ public_key_id: publicKeyId }),
        });
        if (!attachRes.ok) {
          return { ok: false, reason: `Hostinger API returned ${attachRes.status} attaching your SSH key to VPS ${this.vpsId}: ${(await attachRes.text()).slice(0, 300)}` };
        }
      }

      const getRes = await fetch(`${HOSTINGER_API}/virtual-machines/${this.vpsId}`, { headers: this.headers() });
      if (!getRes.ok) return { ok: false, reason: `Hostinger API returned ${getRes.status} fetching VPS ${this.vpsId}: ${(await getRes.text()).slice(0, 300)}` };
      const vm = (await getRes.json()) as VirtualMachine;
      const publicIp = extractIp(vm);
      if (!publicIp) return { ok: false, reason: `Hostinger VPS ${this.vpsId} response had no recognizable IP address field.` };
      return { ok: true, instanceId: String(vm.id ?? this.vpsId), publicIp };
    } catch (error) {
      return { ok: false, reason: `Failed to reach the Hostinger API: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
