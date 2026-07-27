import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { guestConnectorCredentialStore } from '../../../infrastructure/GuestConnectorCredentialStore';

/**
 * Persists a connector credential locally (safeStorage-backed) for Guest-mode sessions, which have
 * no Supabase session to write through ConnectivityCredentialService's Vault. Generic over
 * connector id — not Jira-specific — so a future inline provider reuses this without a new plugin.
 */
export class SaveGuestConnectorCredentialPlugin extends BasePlugin {
  id = 'saveGuestConnectorCredential';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'saveGuestConnectorCredential';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'saveGuestConnectorCredential') return { ok: false, reason: 'failed', message: 'Wrong action type' };
    guestConnectorCredentialStore.save(request.connectorId, request.fields);
    return { ok: true };
  }

  describeInProgress(): string {
    return 'Saving credential…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    return result.ok ? 'Credential saved.' : (result.message ?? 'Could not save credential.');
  }
}

export const saveGuestConnectorCredentialPlugin = new SaveGuestConnectorCredentialPlugin();
