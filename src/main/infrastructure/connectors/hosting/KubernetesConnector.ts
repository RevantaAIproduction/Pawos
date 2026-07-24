import * as fs from 'fs';
import * as path from 'path';
import { runCli } from './vmProvisioning';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

/**
 * Real Kubernetes connector. Shells to the already-authenticated `kubectl`
 * (the same CLI KubernetesCliConnector already detects) against whatever
 * context is current — never manages kubeconfig or cluster credentials
 * itself. Requires a real manifest (Deployment + Service, or anything
 * `kubectl apply -f` accepts) already authored in the project — PawOS never
 * generates Kubernetes YAML on your behalf, the same "never invent
 * deployment infrastructure" rule as every other connector here.
 */
export class KubernetesConnector implements HostingConnector {
  readonly id = 'kubernetes' as const;
  readonly displayName = 'Kubernetes';

  constructor(
    private manifestPath: string | undefined, // relative to the project path, or absolute
    private deploymentName: string | undefined,
    private namespace: string = 'default',
    private serviceName: string | undefined // optional — used only to look up a public URL
  ) {}

  isConfigured(): boolean {
    return Boolean(this.manifestPath && this.deploymentName);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Kubernetes is not configured. Set KUBERNETES_MANIFEST_PATH (a real manifest already in your project) and KUBERNETES_DEPLOYMENT_NAME, and make sure `kubectl config current-context` points at the right cluster.' };
  }

  private resolveManifest(projectPath: string): string {
    return path.isAbsolute(this.manifestPath as string) ? (this.manifestPath as string) : path.join(projectPath, this.manifestPath as string);
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const manifest = this.resolveManifest(projectPath);
    if (!fs.existsSync(manifest)) {
      return { ok: false, reason: `No manifest found at "${manifest}". Kubernetes deploy requires a real manifest already committed to the project.` };
    }
    const apply = await runCli('kubectl', ['apply', '-f', manifest, '-n', this.namespace]);
    if (!apply.ok) return { ok: false, reason: `kubectl apply failed: ${apply.message}` };

    const rollout = await runCli('kubectl', ['rollout', 'status', `deployment/${this.deploymentName}`, '-n', this.namespace, '--timeout=5m'], 6 * 60 * 1000);
    if (!rollout.ok) return { ok: false, reason: `Deployment applied but rollout did not complete: ${rollout.message}` };

    const latest = await this.getLatestDeployment();
    return { ok: true, deploymentUrl: latest.ok ? latest.url : '(deployed — no Service URL configured)', deploymentId: latest.ok ? latest.deploymentId : 'unknown' };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await runCli('kubectl', ['get', 'deployment', this.deploymentName as string, '-n', this.namespace, '-o', 'json']);
    if (!result.ok) return { ok: false, reason: `kubectl get deployment failed: ${result.message}` };
    try {
      const data = JSON.parse(result.stdout) as {
        metadata?: { annotations?: Record<string, string>; creationTimestamp?: string };
        status?: { conditions?: Array<{ type: string; status: string }> };
      };
      const revision = data.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 'unknown';
      const available = data.status?.conditions?.find((c) => c.type === 'Available');
      let url = '(no Service configured — set KUBERNETES_SERVICE_NAME for a URL)';
      if (this.serviceName) {
        const svc = await runCli('kubectl', ['get', 'svc', this.serviceName, '-n', this.namespace, '-o', 'json']);
        if (svc.ok) {
          try {
            const svcData = JSON.parse(svc.stdout) as { status?: { loadBalancer?: { ingress?: Array<{ ip?: string; hostname?: string }> } } };
            const ingress = svcData.status?.loadBalancer?.ingress?.[0];
            if (ingress) url = ingress.hostname ?? ingress.ip ?? url;
          } catch {
            // keep the default url message
          }
        }
      }
      return { ok: true, deploymentId: revision, url, status: available?.status === 'True' ? 'available' : (available?.status ?? 'unknown'), createdAt: data.metadata?.creationTimestamp ?? new Date().toISOString() };
    } catch {
      return { ok: false, reason: 'Could not parse kubectl get deployment output.' };
    }
  }

  /** Kubernetes' real rollback: undo to a previous ReplicaSet revision. */
  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const args = ['rollout', 'undo', `deployment/${this.deploymentName}`, '-n', this.namespace];
    if (deploymentId && deploymentId !== 'unknown') args.push(`--to-revision=${deploymentId}`);
    const result = await runCli('kubectl', args);
    if (!result.ok) return { ok: false, reason: `kubectl rollout undo failed: ${result.message}` };
    return { ok: true };
  }

  /** No separate staging/production Deployment in this simple single-manifest setup — promoting a
   * revision is the same operation as rolling back to it. */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    const rolled = await this.rollback(deploymentId);
    if (!rolled.ok) return rolled;
    const latest = await this.getLatestDeployment();
    return { ok: true, deploymentUrl: latest.ok ? latest.url : '(promoted)' };
  }
}
