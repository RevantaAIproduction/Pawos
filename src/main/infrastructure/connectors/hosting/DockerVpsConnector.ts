import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';
import { deployDockerToHost, getDockerHostDeployment, rollbackDockerHost } from './sshDockerDeploy';

/**
 * Real Docker + VPS connector. Requires a Dockerfile in the project (never
 * invents one — same "never invent deployment infrastructure" discipline as
 * every other real deploy path in this codebase) and a reachable VPS with
 * Docker already installed (or installable via Docker's own official
 * script — see sshDockerDeploy.ts), accessible over SSH with key-based auth
 * already configured. Deploy mechanics (build/save/scp/load/run) live in
 * sshDockerDeploy.ts, shared with every cloud-VM connector that provisions
 * its own host and then deploys to it the same way.
 */
export class DockerVpsConnector implements HostingConnector {
  readonly id = 'dockerVps' as const;
  readonly displayName = 'Docker / VPS';

  constructor(
    private sshHost: string | undefined, // e.g. "deploy@203.0.113.10" — must already work passwordlessly via `ssh <sshHost>`
    private imageName: string | undefined, // e.g. "myapp"
    private containerName: string | undefined, // e.g. "myapp-prod"
    private portMapping: string = '80:80' // host:container, passed straight to `docker run -p`
  ) {}

  isConfigured(): boolean {
    return Boolean(this.sshHost && this.imageName && this.containerName);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Docker/VPS is not configured. Set DEPLOY_SSH_HOST, DEPLOY_IMAGE_NAME, and DEPLOY_CONTAINER_NAME, and confirm `ssh <host>` already works without a password prompt.' };
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    return deployDockerToHost(projectPath, this.sshHost as string, this.imageName as string, this.containerName as string, this.portMapping);
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    return getDockerHostDeployment(this.sshHost as string, this.containerName as string, this.portMapping);
  }

  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    return rollbackDockerHost(this.sshHost as string, this.containerName as string, this.portMapping, deploymentId);
  }

  /** No separate staging slot in this simple single-VPS setup — promoting an image tag is the same
   * operation as rolling back to it (both just mean "run this already-built image now"). */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    const rolled = await this.rollback(deploymentId);
    if (!rolled.ok) return rolled;
    const hostOnly = (this.sshHost as string).split('@').pop() ?? this.sshHost;
    const publicPort = this.portMapping.split(':')[0];
    return { ok: true, deploymentUrl: `http://${hostOnly}:${publicPort}` };
  }
}
