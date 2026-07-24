import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const RENDER_API = 'https://api.render.com/v1';

type RenderDeploy = { id: string; status?: string; createdAt?: string; commit?: { id?: string } };

function unwrapDeploy(item: unknown): RenderDeploy | undefined {
  if (item && typeof item === 'object' && 'deploy' in item) return (item as { deploy: RenderDeploy }).deploy;
  return item as RenderDeploy | undefined;
}

/**
 * Real Render connector, using Render's real REST API (api.render.com/v1)
 * with a Bearer API key. Unlike Vercel/Netlify, Render's real deploy model
 * is Git-connected, not "upload this local folder" — there is no upload
 * endpoint, so `deploy()` here honestly means "trigger Render to build and
 * deploy from the already-connected repo's latest commit," which is the
 * real, documented Trigger Deploy endpoint. `rollback()` uses the same
 * endpoint pointed at a specific previous commit SHA, since Render has no
 * separate rollback API — redeploying an old commit *is* Render's real
 * rollback mechanism.
 */
export class RenderConnector implements HostingConnector {
  readonly id = 'render' as const;
  readonly displayName = 'Render';

  constructor(private apiKey: string | undefined, private serviceId: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.serviceId);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Render is not configured. Set RENDER_API_KEY and RENDER_SERVICE_ID (from the Render dashboard).' };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  async deploy(): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${RENDER_API}/services/${this.serviceId}/deploys`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ clearCache: 'do_not_clear' }),
      });
      if (!res.ok) return { ok: false, reason: `Render API returned ${res.status} triggering a deploy: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as RenderDeploy;
      return { ok: true, deploymentUrl: '(deploy triggered — check the Render dashboard for the live URL)', deploymentId: data.id };
    } catch (error) {
      return { ok: false, reason: `Failed to reach the Render API: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${RENDER_API}/services/${this.serviceId}/deploys?limit=1`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `Render API returned ${res.status} listing deploys: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as unknown[];
      const deploy = unwrapDeploy(data[0]);
      if (!deploy) return { ok: false, reason: `No deploys found for Render service ${this.serviceId}.` };
      return { ok: true, deploymentId: deploy.id, url: '(see the Render dashboard for this service\'s URL)', status: deploy.status ?? 'unknown', createdAt: deploy.createdAt ?? new Date().toISOString() };
    } catch (error) {
      return { ok: false, reason: `Failed to reach the Render API: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** deploymentId here is expected to be a previous deploy's commit SHA — redeploying it is Render's real rollback mechanism. */
  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${RENDER_API}/services/${this.serviceId}/deploys`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ commitId: deploymentId }),
      });
      if (!res.ok) return { ok: false, reason: `Render API returned ${res.status} rolling back to ${deploymentId}: ${(await res.text()).slice(0, 300)}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `Failed to reach the Render API: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async promote(): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    return { ok: false, reason: 'A single Render service has no separate staging/production slot to promote between — use Render Preview Environments (a separate service) for staging.' };
  }
}
