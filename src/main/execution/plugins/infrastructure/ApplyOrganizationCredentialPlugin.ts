import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { infrastructureConnectorRegistry, type InfraConnectorKind } from '../../../infrastructure/InfrastructureConnectorRegistry';

const CONNECTOR_KINDS: InfraConnectorKind[] = ['sourceControl', 'projectManagement', 'cicd', 'hosting', 'cloud', 'container', 'infrastructure'];

function isValidKind(kind: string): kind is InfraConnectorKind {
  return (CONNECTOR_KINDS as string[]).includes(kind);
}

/**
 * Phase 6: applies an org-scoped credential vault secret (already decrypted
 * by the renderer via read_organization_credential) to the matching local
 * connector instance for the rest of this process's lifetime — additive to
 * bootstrap.ts's existing env-var wiring, which stays the sole source for
 * Individual/Guest accounts and for any connector an org hasn't configured.
 * Never persists the secret itself; this only ever updates the in-memory
 * connector, exactly like a fresh .env value would at startup.
 */
export class ApplyOrganizationCredentialPlugin extends BasePlugin {
  id = 'applyOrganizationCredential';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'applyOrganizationCredential';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'applyOrganizationCredential') return { ok: false, reason: 'failed', message: 'Wrong action type' };
    if (!isValidKind(request.connectorKind)) {
      return { ok: false, reason: 'failed', message: `Unknown connector kind: ${request.connectorKind}` };
    }

    const connector = infrastructureConnectorRegistry.get(request.connectorKind, request.connectorId) as unknown as { setToken?: (token: string) => void } | undefined;
    if (!connector || typeof connector.setToken !== 'function') {
      return { ok: false, reason: 'failed', message: `${request.connectorId} does not accept an org-scoped credential.` };
    }

    connector.setToken(request.secret);
    return { ok: true };
  }

  describeInProgress(): string {
    return 'Applying organization credential…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'applyOrganizationCredential') return '';
    return result.ok ? `${request.connectorId} now uses the organization's shared credential.` : (result.message ?? 'Could not apply credential.');
  }
}

export const applyOrganizationCredentialPlugin = new ApplyOrganizationCredentialPlugin();
