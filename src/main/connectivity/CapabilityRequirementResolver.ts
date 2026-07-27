import { infrastructureConnectorRegistry, type InfraConnectorKind } from '../infrastructure/InfrastructureConnectorRegistry';
import { CONNECTOR_CATEGORY_LABELS, type ConnectivityScope, type ConnectorCategory } from '../../shared/connectivity/ConnectivityTypes';
import { connectionManager } from './ConnectionManager';
import { connectorRegistry } from './ConnectorRegistry';
import { capabilityResolver } from './CapabilityResolver';
import type { RequirementResolver } from '../runtime/RequirementGate';
import type { CapabilityProviderCandidate } from '../../shared/runtime/RequirementTypes';

/**
 * Categories that map onto an existing `.env`-based Infrastructure Runtime connector kind whose
 * connectors expose `isConfigured()`. This is a deliberate, temporary legacy fallback — none of
 * these categories have a real Connectivity Runtime `ConnectorSDK` yet. `projectManagement` is
 * narrowed to a real `ConnectorSDK`-backed check (Jira) in a later phase; every other category
 * stays on this fallback until its own bridge lands — swapping one is a one-branch change here,
 * never a change to RequirementGate itself.
 */
const LEGACY_INFRA_KIND_BY_CATEGORY: Partial<Record<ConnectorCategory, Extract<InfraConnectorKind, 'sourceControl' | 'projectManagement' | 'cicd' | 'hosting' | 'infrastructure'>>> = {
  sourceControl: 'sourceControl',
  projectManagement: 'projectManagement',
  hosting: 'hosting',
  cicd: 'cicd',
};

function blockedResult(category: ConnectorCategory, reasonHint: string | undefined, message: string, candidateProviders: CapabilityProviderCandidate[]) {
  const label = CONNECTOR_CATEGORY_LABELS[category] ?? category;
  return {
    satisfied: false as const,
    blockingResult: {
      ok: false as const,
      reason: 'requires-confirmation' as const,
      message,
      confirmation: {
        kind: 'connectCapability' as const,
        capabilities: [{ category, label, reasonHint, candidateProviders }],
      },
    },
  };
}

/**
 * Fallback for any category with no legacy-registry mapping — built entirely from already-
 * generic Connectivity Runtime primitives (`ConnectionManager`/`ConnectorRegistry`), so it's free
 * capability-gating for Google Workspace (`'productivity'`) today and for any future non-legacy
 * connector later, with no further edits to this resolver required. Absent `ctx.scope` (some
 * caller not yet passing one) degrades to the same honest "not connected" outcome the legacy
 * branch already produces in that situation — never a fabricated satisfied result.
 *
 * When `requirement.capability` is set and a connector for this category IS connected, this also
 * checks the connector's *live* capability set (`capabilityResolver.listAvailableConnectors`,
 * already exists, already does this exact live check). If the connected connector doesn't yet
 * have that specific capability, the requirement resolves as unsatisfied with `grantMode:
 * 'incrementalScope'` instead of `'connect'` — the connector is already connected, so only the
 * missing scope needs to be requested, never a full reconnect.
 */
async function resolveViaConnectivityRuntime(
  category: ConnectorCategory,
  requirementCapability: string | undefined,
  reasonHint: string | undefined,
  scope: ConnectivityScope | undefined
) {
  const label = CONNECTOR_CATEGORY_LABELS[category] ?? category;
  const candidatesByCategory = connectorRegistry.listByCategory(category);

  const connectedConnection = scope
    ? (await connectionManager.listConnections(scope)).find(
        (c) => c.status === 'connected' && connectorRegistry.get(c.connectorId)?.definition.category === category
      )
    : undefined;

  if (connectedConnection) {
    if (!requirementCapability) {
      return { satisfied: true as const };
    }
    const availableForCapability = await capabilityResolver.listAvailableConnectors(requirementCapability, scope!);
    const stillAvailable = availableForCapability.some((def) => def.id === connectedConnection.connectorId);
    if (stillAvailable) {
      return { satisfied: true as const };
    }
    const connectedSdk = connectorRegistry.get(connectedConnection.connectorId);
    const incrementalCandidate: CapabilityProviderCandidate = {
      connectorId: connectedConnection.connectorId,
      connectorName: connectedSdk?.definition.displayName ?? connectedConnection.connectorId,
      connectVia: 'inline',
      grantMode: 'incrementalScope',
      missingCapability: requirementCapability,
    };
    return blockedResult(category, reasonHint, `${label} needs one more permission to continue.`, [incrementalCandidate]);
  }

  if (candidatesByCategory.length === 0) {
    // No connector kind exists yet for this category — report honestly rather than fabricate a
    // check or a candidate provider list.
    return blockedResult(category, reasonHint, `${label} needed to continue, but no connector is available for it yet.`, []);
  }

  const candidateProviders: CapabilityProviderCandidate[] = candidatesByCategory.map((sdk) => ({
    connectorId: sdk.definition.id,
    connectorName: sdk.definition.displayName,
    connectVia: sdk.definition.authMethod === 'oauth2' ? 'inline' : 'settings',
    grantMode: 'connect',
  }));
  return blockedResult(category, reasonHint, `${label} needed to continue.`, candidateProviders);
}

/**
 * The one resolver registered with RequirementGate this pass. Contains all of the "check the
 * registry, build the candidate provider list, decide connectVia" logic that would otherwise be
 * duplicated inside every plugin that needs a capability.
 */
export const capabilityRequirementResolver: RequirementResolver<'capability'> = {
  kind: 'capability',
  async resolve(requirement, ctx) {
    const label = CONNECTOR_CATEGORY_LABELS[requirement.category] ?? requirement.category;
    const infraKind = LEGACY_INFRA_KIND_BY_CATEGORY[requirement.category];

    if (!infraKind) {
      return resolveViaConnectivityRuntime(requirement.category, requirement.capability, requirement.reasonHint, ctx.scope);
    }

    if (infrastructureConnectorRegistry.listConfigured(infraKind).length > 0) {
      return { satisfied: true };
    }

    const candidateProviders: CapabilityProviderCandidate[] = infrastructureConnectorRegistry.list(infraKind).map((connector) => ({
      connectorId: connector.id,
      connectorName: connector.displayName,
      connectVia: 'settings',
      grantMode: 'connect',
    }));

    return blockedResult(requirement.category, requirement.reasonHint, `${label} needed to continue.`, candidateProviders);
  },
};
