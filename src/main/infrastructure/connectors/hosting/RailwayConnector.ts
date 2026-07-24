import { execFile } from 'child_process';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('npx', args, { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1000) });
        return;
      }
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}

async function graphql(token: string, query: string, variables: Record<string, unknown>): Promise<ConnectorResult<{ data: unknown }>> {
  try {
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return { ok: false, reason: `Railway API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
    if (json.errors?.length) return { ok: false, reason: `Railway API error: ${json.errors.map((e) => e.message).join('; ')}` };
    return { ok: true, data: json.data };
  } catch (error) {
    return { ok: false, reason: `Failed to reach Railway: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Real Railway connector. `deploy` shells out to the official `@railway/cli`
 * (via npx, same discipline as Vercel/Netlify — never invent deployment
 * infrastructure). Status/rollback go through Railway's real public GraphQL
 * API since the CLI has no stable machine-readable rollback subcommand.
 * Requires RAILWAY_TOKEN (project token) and RAILWAY_PROJECT_ID/RAILWAY_SERVICE_ID
 * for the API calls — the CLI deploy itself only needs the token.
 */
export class RailwayConnector implements HostingConnector {
  readonly id = 'railway' as const;
  readonly displayName = 'Railway';

  constructor(
    private token: string | undefined,
    private projectId: string | undefined,
    private serviceId: string | undefined
  ) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  setToken(token: string): void {
    this.token = token;
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Railway is not configured. Add RAILWAY_TOKEN to .env to connect it.' };
  }

  async deploy(projectPath: string, opts?: { prod?: boolean }): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const args = ['@railway/cli', 'up', '--path', projectPath, '--ci'];
    if (opts?.prod && this.serviceId) args.push('--service', this.serviceId);
    const result = await run(args, { ...process.env, RAILWAY_TOKEN: this.token });
    if (!result.ok) return { ok: false, reason: `Railway deploy failed: ${result.message}` };
    // The CLI's own output doesn't reliably print a stable deployment id/url in --ci mode,
    // so fetch the just-created deployment from the real API rather than parse fragile text.
    const latest = await this.getLatestDeployment();
    if (!latest.ok) return { ok: true, deploymentUrl: '(deployed — check Railway dashboard)', deploymentId: 'unknown' };
    return { ok: true, deploymentUrl: latest.url, deploymentId: latest.deploymentId };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!this.serviceId) return { ok: false, reason: 'RAILWAY_SERVICE_ID is not set — cannot look up deployment status.' };
    const query = `query($serviceId: String!) { deployments(input: { serviceId: $serviceId }, first: 1) { edges { node { id status url createdAt } } } }`;
    const result = await graphql(this.token as string, query, { serviceId: this.serviceId });
    if (!result.ok) return result;
    const data = result.data as { deployments?: { edges?: Array<{ node: { id: string; status: string; url?: string; createdAt: string } }> } };
    const node = data.deployments?.edges?.[0]?.node;
    if (!node) return { ok: false, reason: 'No deployments found for this Railway service.' };
    return { ok: true, deploymentId: node.id, url: node.url ?? '(no public domain configured)', status: node.status, createdAt: node.createdAt };
  }

  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const query = `mutation($id: String!) { deploymentRollback(id: $id) }`;
    const result = await graphql(this.token as string, query, { id: deploymentId });
    if (!result.ok) return result;
    return { ok: true };
  }

  /** Railway has no separate "promote a preview" concept like Vercel — a redeploy of the same
   * build to the production service is the closest real equivalent, so this re-triggers deploy. */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!this.serviceId) return { ok: false, reason: 'RAILWAY_SERVICE_ID is not set — cannot redeploy to production.' };
    const query = `mutation($id: String!) { deploymentRedeploy(id: $id) { id url } }`;
    const result = await graphql(this.token as string, query, { id: deploymentId });
    if (!result.ok) return result;
    const data = result.data as { deploymentRedeploy?: { url?: string } };
    return { ok: true, deploymentUrl: data.deploymentRedeploy?.url ?? '(redeployed — check Railway dashboard)' };
  }
}
