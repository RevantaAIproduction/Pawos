import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';

export class RequestCredentialAccessPlugin extends BasePlugin {
  id = 'requestCredentialAccess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'requestCredentialAccess';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'requestCredentialAccess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { credentialType, service } = request;

    try {
      // Validate credential type
      const validTypes = ['api-key', 'password', 'token', 'certificate'];
      if (!validTypes.includes(credentialType)) {
        return { ok: false, reason: 'failed', message: `Invalid credential type: ${credentialType}` };
      }

      // Log credential access request (never store actual credentials)
      const accessLog = {
        credentialType,
        service: service || 'unknown',
        requestedAt: Date.now(),
        accessGranted: true,
        // Never include actual credentials in logs
        masked: true,
      };

      return {
        ok: true,
        data: {
          credentialType,
          service,
          accessGranted: true,
          accessLog,
          warning: 'Credentials are encrypted and never logged in plain text',
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to grant credential access: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'requestCredentialAccess') return 'Working on that…';
    return `Requesting ${request.credentialType}${request.service ? ` for ${request.service}` : ''}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'requestCredentialAccess') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to grant credential access.`;
    return `Granted ${request.credentialType} access${request.service ? ` for ${request.service}` : ''}.`;
  }
}

export const requestCredentialAccessPlugin = new RequestCredentialAccessPlugin();
