import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { connectivityRuntime } from '../../../connectivity/ConnectivityRuntime';

/**
 * Generic "connect any registered non-apiToken ConnectorSDK" action — the OAuth2/PKCE
 * counterpart to connectJiraCredential's apiToken-form path. Unlike Jira's connect (which needs
 * no user interaction beyond the form fields already collected), this dispatches straight to
 * ConnectionManager.connect(), which itself opens the system browser via OAuthManager and doesn't
 * resolve until the user finishes (or abandons) the consent flow — so execute() here can take as
 * long as the user takes in their browser. Reusable unmodified by any future OAuth connector
 * (Microsoft, Dropbox, Slack, Notion, GitHub): nothing about this plugin is Google-specific.
 */
export class ConnectivityConnectPlugin extends BasePlugin {
  id = 'connectivityConnect';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'connectivityConnect';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'connectivityConnect') return { ok: false, reason: 'failed', message: 'Wrong action type' };
    try {
      const connection = await connectivityRuntime.connections.connect(
        request.connectorId,
        request.scope ?? { userId: 'guest' },
        request.incrementalCapabilities ? { incrementalCapabilities: request.incrementalCapabilities } : undefined
      );
      return { ok: true, data: { connection } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  describeInProgress(): string {
    return 'Connecting…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    return result.ok ? 'Connected.' : (result.message ?? 'Could not connect.');
  }
}

export const connectivityConnectPlugin = new ConnectivityConnectPlugin();
