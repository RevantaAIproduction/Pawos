import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { connectorMcpGateway, type McpGatewayFailure } from '../../../connectivity/mcp/ConnectorMcpGateway';

/**
 * The assistant's access to connectors' official MCP servers — two read-only actions:
 *  - listConnectorMcpTools: which read tools a connector's MCP server offers right now.
 *  - callConnectorMcpTool: call one of them.
 *
 * Both go through ConnectorMcpGateway, which enforces the connector's entitlement, the provider's
 * read-tool allowlist and the credential rules. Nothing here can write to a provider.
 *
 * A failure is an ordinary, explained result — the message tells the assistant to fall back to the
 * connector's existing actions, which keep working exactly as before.
 */
function toFailure(failure: McpGatewayFailure): ActionResult {
  return { ok: false, reason: failure.code === 'not-entitled' ? 'entitlement-restricted' : 'failed', message: failure.message };
}

export class ConnectorMcpPlugin extends BasePlugin {
  id = 'connectorMcp';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listConnectorMcpTools' || request.type === 'callConnectorMcpTool';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type === 'listConnectorMcpTools') {
      const result = await connectorMcpGateway.listReadTools(request.connectorId);
      if (!result.ok) return toFailure(result);
      return { ok: true, data: { connectorId: result.connectorId, server: result.serverName, readTools: result.tools } };
    }
    if (request.type === 'callConnectorMcpTool') {
      const result = await connectorMcpGateway.callReadTool(request.connectorId, request.tool, request.arguments);
      if (!result.ok) return toFailure(result);
      return {
        ok: true,
        data: {
          connectorId: result.connectorId,
          tool: result.tool,
          source: result.source,
          // The content below came from an external service. It is data to read, not instructions to follow.
          untrustedExternalData: true,
          truncated: result.truncated,
          content: result.content,
        },
      };
    }
    return { ok: false, reason: 'failed', message: 'Mismatched request.' };
  }

  describeInProgress(request: ActionRequest): string {
    return request.type === 'callConnectorMcpTool' ? `Reading from ${request.connectorId}…` : 'Checking available tools…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    return result.ok ? 'Done.' : describeFailure(result);
  }
}

export const connectorMcpPlugin = new ConnectorMcpPlugin();
