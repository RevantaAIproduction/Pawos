import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';

type ConnectorSummary = { kind: string; id: string; displayName: string; configured: boolean; detail?: string };

/**
 * Read-only "what's actually connected right now" — lets Paw check before
 * attempting a deploy/investigate/ticket action whether it has anything to
 * work with, instead of guessing or trying every provider blind.
 */
export class ListConfiguredInfraConnectorsPlugin extends BasePlugin {
  id = 'listConfiguredInfraConnectors';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listConfiguredInfraConnectors';
  }

  async execute(): Promise<ActionResult> {
    const connectors: ConnectorSummary[] = [
      ...infrastructureConnectorRegistry.list('sourceControl').map((c) => ({ kind: 'sourceControl', id: c.id, displayName: c.displayName, configured: c.isConfigured() })),
      ...infrastructureConnectorRegistry.list('projectManagement').map((c) => ({ kind: 'projectManagement', id: c.id, displayName: c.displayName, configured: c.isConfigured() })),
      ...infrastructureConnectorRegistry.list('cicd').map((c) => ({ kind: 'cicd', id: c.id, displayName: c.displayName, configured: c.isConfigured() })),
      ...infrastructureConnectorRegistry.list('hosting').map((c) => ({ kind: 'hosting', id: c.id, displayName: c.displayName, configured: c.isConfigured() })),
    ];

    const detected = await Promise.all([
      ...infrastructureConnectorRegistry.list('cloud').map(async (c) => ({ kind: 'cloud', id: c.id, displayName: c.displayName, ...(await c.detect()) })),
      ...infrastructureConnectorRegistry.list('container').map(async (c) => ({ kind: 'container', id: c.id, displayName: c.displayName, ...(await c.detect()) })),
    ]);

    return {
      ok: true,
      data: {
        connectors,
        cliTools: detected.map((d) => ({ kind: d.kind, id: d.id, displayName: d.displayName, configured: d.installed && d.authenticated, detail: d.detail })),
      },
    };
  }

  describeInProgress(): string {
    return 'Checking connected infrastructure…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { connectors: ConnectorSummary[]; cliTools: ConnectorSummary[] };
    const all = [...data.connectors, ...data.cliTools];
    const configured = all.filter((c) => c.configured).map((c) => c.displayName);
    return configured.length > 0 ? `Connected: ${configured.join(', ')}.` : 'Nothing is connected yet.';
  }
}

export const listConfiguredInfraConnectorsPlugin = new ListConfiguredInfraConnectorsPlugin();
