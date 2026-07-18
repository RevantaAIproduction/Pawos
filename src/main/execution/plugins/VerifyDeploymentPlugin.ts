import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { waitForHttpHealthy } from '../verification/ProcessVerification';
import { isAllowedUrl } from '../DevBrowserManager';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

/** Same origin restriction as the Development Browser — localhost/127.0.0.1 or a workspace's own recorded deployment URL, never an arbitrary third-party site. */
export class VerifyDeploymentPlugin extends BasePlugin {
  id = 'verifyDeployment';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'verifyDeployment';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'verifyDeployment') return [];
    if (!isAllowedUrl(request.url, workspaceMemoryStore.listDeploymentUrls())) {
      return [{ id: 'url-not-allowed', message: 'I can only verify localhost/127.0.0.1 or a recorded deployment URL.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'verifyDeployment') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isAllowedUrl(request.url, workspaceMemoryStore.listDeploymentUrls())) {
      return { ok: false, reason: 'failed', message: 'I can only verify localhost/127.0.0.1 or a recorded deployment URL.' };
    }

    const result = await waitForHttpHealthy(request.url, { timeoutMs: request.timeoutMs ?? 15_000 });
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { url: request.url, status: result.status } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'verifyDeployment') return 'Working on that…';
    return `Checking whether ${request.url} responds…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'verifyDeployment') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { url: string; status: number } | undefined;
    return `${data?.url} responded with status ${data?.status} — it's live.`;
  }
}

export const verifyDeploymentPlugin = new VerifyDeploymentPlugin();
