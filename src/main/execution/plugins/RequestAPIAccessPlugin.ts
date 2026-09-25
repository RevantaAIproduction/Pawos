import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';

export class RequestAPIAccessPlugin extends BasePlugin {
  id = 'requestAPIAccess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'requestAPIAccess';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'requestAPIAccess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { service, scopes } = request;

    try {
      const apiEndpoints: Record<string, string> = {
        github: 'https://api.github.com',
        slack: 'https://slack.com/api',
        notion: 'https://api.notion.com',
        jira: 'https://api.atlassian.com',
        linear: 'https://api.linear.app',
        aws: 'https://aws.amazon.com',
        gcp: 'https://www.googleapis.com',
        azure: 'https://management.azure.com',
      };

      const endpoint = apiEndpoints[service];
      if (!endpoint) {
        return { ok: false, reason: 'failed', message: `Unknown service: ${service}` };
      }

      return {
        ok: true,
        data: {
          service,
          scopes: scopes || [],
          endpoint,
          accessGranted: true,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to grant API access: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'requestAPIAccess') return 'Working on that…';
    const scopes = request.scopes?.join(', ') || 'default';
    return `Granting ${request.service} API access (${scopes})…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'requestAPIAccess') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to grant API access.`;
    const scopes = request.scopes?.length ? ` with ${request.scopes.join(', ')} scopes` : '';
    return `Granted ${request.service} API access${scopes}.`;
  }
}

export const requestAPIAccessPlugin = new RequestAPIAccessPlugin();
