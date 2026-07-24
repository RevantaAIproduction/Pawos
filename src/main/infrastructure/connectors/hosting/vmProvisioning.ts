import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';
import { provisionedInstanceStore, type ProvisionedInstance } from '../../ProvisionedInstanceStore';
import { deployDockerToHost, getDockerHostDeployment, rollbackDockerHost } from './sshDockerDeploy';

export type ProvisionResult = ConnectorResult<{ instanceId: string; publicIp: string; region?: string; size?: string }>;

/**
 * Reads the same local SSH public key the user's own already-working `ssh`/`scp`
 * commands rely on, so a freshly-provisioned VM can be handed the *same*
 * identity rather than PawOS generating or managing a keypair of its own.
 * Never returns a private key or any secret material — only the public half.
 */
export function readLocalSshPublicKey(): { ok: true; publicKey: string } | { ok: false; reason: string } {
  const dir = path.join(os.homedir(), '.ssh');
  for (const name of ['id_ed25519.pub', 'id_ecdsa.pub', 'id_rsa.pub']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      try {
        return { ok: true, publicKey: fs.readFileSync(p, 'utf-8').trim() };
      } catch {
        // fall through to try the next key type
      }
    }
  }
  return { ok: false, reason: `No SSH public key found in ${dir} (looked for id_ed25519.pub, id_ecdsa.pub, id_rsa.pub). Generate one with \`ssh-keygen\` first.` };
}

const PROVISION_TIMEOUT_MS = 5 * 60 * 1000;

/** Shared execFile-with-args-array runner for every cloud VM provisioning connector's own CLI (aws/gcloud/az/doctl/linode-cli/vultr-cli/hcloud/oci) — same discipline as runGit.ts/execCli.ts, just with a provisioning-length timeout instead of a read-only-probe one. */
export function runCli(command: string, args: string[], timeoutMs: number = PROVISION_TIMEOUT_MS): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1500) });
        return;
      }
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}

/**
 * Shared "provision once, remember it, deploy the same way every cloud VM
 * connector already deploys" flow. Real per-provider work is only the
 * `provision()` call each connector supplies (shelling to that provider's
 * own official, already-authenticated CLI to launch an instance and read
 * back its public IP) — everything after that (remembering the instance,
 * waiting for SSH to come up, building/shipping/running the Docker image)
 * is identical across AWS/GCP/Azure/DigitalOcean/Linode/Vultr/Hetzner/OCI/
 * Hostinger VPS, so it lives here once instead of 9 times.
 */
export async function ensureProvisionedInstance(
  providerId: string,
  sshUser: string,
  provision: () => Promise<ProvisionResult>
): Promise<ConnectorResult<{ sshHost: string; instance: ProvisionedInstance; justProvisioned: boolean }>> {
  const existing = provisionedInstanceStore.get(providerId);
  if (existing) return { ok: true, sshHost: `${sshUser}@${existing.publicIp}`, instance: existing, justProvisioned: false };

  const provisioned = await provision();
  if (!provisioned.ok) return provisioned;

  const instance: ProvisionedInstance = {
    providerId,
    instanceId: provisioned.instanceId,
    publicIp: provisioned.publicIp,
    region: provisioned.region,
    size: provisioned.size,
    createdAt: new Date().toISOString(),
  };
  provisionedInstanceStore.set(instance);

  // A freshly-booted VM's SSH daemon (and cloud-init) needs a little time before it accepts connections.
  await new Promise((resolve) => setTimeout(resolve, 25_000));

  return { ok: true, sshHost: `${sshUser}@${provisioned.publicIp}`, instance, justProvisioned: true };
}

/**
 * Base implementation of the HostingConnector interface for a "PawOS
 * provisions the VM, then deploys to it over SSH + Docker" connector.
 * Subclasses supply provider identity, config, and the one real
 * provider-specific `provision()` method; deploy/status/rollback/promote
 * are identical for every such provider.
 */
export abstract class VmProvisioningConnector implements HostingConnector {
  abstract readonly id: HostingConnector['id'];
  abstract readonly displayName: string;

  constructor(
    protected imageName: string | undefined,
    protected containerName: string | undefined,
    protected portMapping: string,
    protected sshUser: string
  ) {}

  abstract isConfigured(): boolean;
  abstract notConfigured(): { ok: false; reason: string };
  abstract provision(): Promise<ProvisionResult>;

  private async ensureHost(): Promise<ConnectorResult<{ sshHost: string }>> {
    if (!this.imageName || !this.containerName) {
      return { ok: false, reason: `${this.displayName} needs an image name and container name configured before it can deploy.` };
    }
    return ensureProvisionedInstance(this.id, this.sshUser, () => this.provision());
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const ensured = await this.ensureHost();
    if (!ensured.ok) return ensured;
    return deployDockerToHost(projectPath, ensured.sshHost, this.imageName as string, this.containerName as string, this.portMapping);
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    const existing = provisionedInstanceStore.get(this.id);
    if (!existing) return { ok: false, reason: `No ${this.displayName} instance has been provisioned yet — deploy first.` };
    return getDockerHostDeployment(`${this.sshUser}@${existing.publicIp}`, this.containerName as string, this.portMapping);
  }

  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const existing = provisionedInstanceStore.get(this.id);
    if (!existing) return { ok: false, reason: `No ${this.displayName} instance has been provisioned yet.` };
    return rollbackDockerHost(`${this.sshUser}@${existing.publicIp}`, this.containerName as string, this.portMapping, deploymentId);
  }

  /** No separate staging slot once an instance is provisioned — promoting an image tag is the same
   * operation as rolling back to it (both just mean "run this already-built image now"). */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    const rolled = await this.rollback(deploymentId);
    if (!rolled.ok) return rolled;
    const existing = provisionedInstanceStore.get(this.id);
    const publicPort = this.portMapping.split(':')[0];
    return { ok: true, deploymentUrl: `http://${existing?.publicIp}:${publicPort}` };
  }
}
