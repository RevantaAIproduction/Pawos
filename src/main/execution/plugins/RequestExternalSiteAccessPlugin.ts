import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';

export class RequestExternalSiteAccessPlugin extends BasePlugin {
  id = 'requestExternalSiteAccess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'requestExternalSiteAccess';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'requestExternalSiteAccess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { url, origin, reason } = request;

    try {
      // Validate URL format
      try {
        new URL(url);
      } catch {
        return { ok: false, reason: 'failed', message: `Invalid URL: ${url}` };
      }

      // Check if it's a restricted localhost/internal origin (allowed by default)
      const urlObj = new URL(url);
      const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(urlObj.hostname);
      const isInternal = urlObj.hostname.endsWith('.local') || urlObj.hostname.endsWith('.internal');

      return {
        ok: true,
        data: {
          url,
          origin,
          reason: reason || 'User requested access',
          isLocalhost,
          isInternal,
          accessGranted: true,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to grant site access: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'requestExternalSiteAccess') return 'Working on that…';
    return `Granting access to ${request.origin}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'requestExternalSiteAccess') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to grant site access.`;
    return `Granted access to ${request.origin}${request.reason ? `: ${request.reason}` : ''}.`;
  }
}

export const requestExternalSiteAccessPlugin = new RequestExternalSiteAccessPlugin();
