import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { jiraConnectorSDK } from '../../../connectivity/connectors/JiraConnectorSDK';

/**
 * Activates Jira for the current process by validating the supplied credential live and
 * registering it into the Infrastructure Runtime (via JiraConnectorSDK.authenticate) — the same
 * mechanism InvestigateTicketPlugin's requirements() check looks for. Persisting the credential so
 * it survives a restart is a separate concern: an authenticated session's renderer writes it to
 * the Supabase Vault directly (ConnectivityCredentialService), independent of this action; a
 * authenticated session persists credentials through the Supabase Vault path.
 */
export class ConnectJiraCredentialPlugin extends BasePlugin {
  id = 'connectJiraCredential';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'connectJiraCredential';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'connectJiraCredential') return { ok: false, reason: 'failed', message: 'Wrong action type' };
    if (!request.scope || request.scope.userId === 'guest') {
      return { ok: false, reason: 'entitlement-restricted', message: 'Connecting Jira requires signing in to PawOS.' };
    }
    try {
      await jiraConnectorSDK.authenticate(request.scope, {
        baseUrl: request.baseUrl,
        email: request.email,
        apiToken: request.apiToken,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  describeInProgress(): string {
    return 'Connecting Jira…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    return result.ok ? 'Jira connected.' : (result.message ?? 'Could not connect Jira.');
  }
}

export const connectJiraCredentialPlugin = new ConnectJiraCredentialPlugin();
