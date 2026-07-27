import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ safeStorage: { encryptString: vi.fn(), decryptString: vi.fn() }, app: { getPath: () => '/tmp' } }));

const beginAuthorization = vi.fn();
const exchangeCodeForToken = vi.fn();

vi.mock('./OAuthManager', () => ({
  oauthManager: {
    beginAuthorization: (...args: unknown[]) => beginAuthorization(...args),
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForToken(...args),
    refreshAccessToken: vi.fn(),
    revokeToken: vi.fn(),
    refreshAndPersist: vi.fn(),
  },
}));

vi.mock('../infrastructure/GuestConnectorCredentialStore', () => ({
  guestConnectorCredentialStore: { save: vi.fn(), load: vi.fn(), remove: vi.fn() },
}));

import { GoogleWorkspaceConnectorSDK } from './connectors/GoogleWorkspaceConnectorSDK';
import { connectorRegistry } from './ConnectorRegistry';
import { connectionManager } from './ConnectionManager';
import { capabilityRequirementResolver } from './CapabilityRequirementResolver';
import { credentialVaultBridge } from './CredentialVaultBridge';
import type { ActionResult } from '../../shared/actions/ActionTypes';

function capabilitiesOf(blockingResult: ActionResult | undefined) {
  return blockingResult && !blockingResult.ok ? blockingResult.confirmation?.capabilities : undefined;
}

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

/**
 * End-to-end proof of the "complete connection lifecycle" the user asked for: a real
 * ConnectorSDK, registered in the real ConnectorRegistry, connected through the real
 * ConnectionManager, gated by the real CapabilityRequirementResolver — with only OAuthManager's
 * network calls mocked. This is the concrete scenario from the plan's verification section:
 * connect with Calendar only, confirm a Gmail-needing requirement resolves as an incremental
 * grant (not a full reconnect), perform it, confirm the requirement is now satisfied and the
 * Calendar connection was never disturbed.
 */
describe('Incremental authorization — full connection-lifecycle integration', () => {
  const scope = { userId: 'integration-user' };
  const sdk = new GoogleWorkspaceConnectorSDK();

  beforeEach(() => {
    connectorRegistry.register(sdk);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('oauth2/v3/userinfo')) {
          return { ok: true, json: async () => ({}) } as Response;
        }
        throw new Error(`Unexpected fetch in integration test: ${url}`);
      })
    );
  });

  afterEach(async () => {
    connectorRegistry.unregister(sdk.definition.id);
    await credentialVaultBridge.revoke(sdk.definition.id, scope);
    beginAuthorization.mockReset();
    exchangeCodeForToken.mockReset();
    vi.unstubAllGlobals();
  });

  it('gates, connects, incrementally grants, and re-resolves as satisfied — without disturbing the original grant', async () => {
    // 1. Nothing connected yet — a Gmail-needing requirement should ask to connect.
    const beforeConnect = await capabilityRequirementResolver.resolve(
      { kind: 'capability', category: 'productivity', capability: 'listThreads' },
      { scope }
    );
    expect(beforeConnect.satisfied).toBe(false);
    expect(capabilitiesOf(beforeConnect.blockingResult)?.[0]?.candidateProviders?.[0]?.grantMode).toBe('connect');

    // 2. Connect with only Calendar granted (simulating a user who only approved Calendar in
    // the consent screen — RequirementGate's automatic-request mechanism doesn't control what
    // Google actually returns).
    beginAuthorization.mockReturnValueOnce({
      requestId: 'req-1',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      result: Promise.resolve({ code: 'code-1', codeVerifier: 'verifier-1' }),
    });
    exchangeCodeForToken.mockResolvedValueOnce({
      accessToken: 'AT-calendar-only',
      refreshToken: 'RT-1',
      grantedScopes: [USERINFO_SCOPE, CALENDAR_SCOPE],
    });
    await connectionManager.connect(sdk.definition.id, scope);

    // 3. RequirementGate must now auto-detect the missing Gmail scope and offer an incremental
    // grant, not force a full reconnect.
    const afterConnect = await capabilityRequirementResolver.resolve(
      { kind: 'capability', category: 'productivity', capability: 'listThreads' },
      { scope }
    );
    expect(afterConnect.satisfied).toBe(false);
    const incrementalCandidate = capabilitiesOf(afterConnect.blockingResult)?.[0]?.candidateProviders?.[0];
    expect(incrementalCandidate?.grantMode).toBe('incrementalScope');
    expect(incrementalCandidate?.missingCapability).toBe('listThreads');
    const missingCapability = incrementalCandidate?.missingCapability;
    if (!missingCapability) throw new Error('Expected a missingCapability on the incremental candidate.');

    // Calendar access itself must already be satisfied — connecting for Gmail must never look
    // like Calendar broke.
    const calendarStillFine = await capabilityRequirementResolver.resolve(
      { kind: 'capability', category: 'productivity', capability: 'listEvents' },
      { scope }
    );
    expect(calendarStillFine.satisfied).toBe(true);

    // 4. Perform the incremental grant exactly as ConversationRuntime.connectCapabilityAndRetry
    // would, using the missing capability surfaced by the resolver.
    beginAuthorization.mockReturnValueOnce({
      requestId: 'req-2',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      result: Promise.resolve({ code: 'code-2', codeVerifier: 'verifier-2' }),
    });
    exchangeCodeForToken.mockResolvedValueOnce({
      accessToken: 'AT-calendar-and-gmail',
      refreshToken: 'RT-1',
      grantedScopes: [GMAIL_READONLY_SCOPE],
    });
    await connectionManager.connect(sdk.definition.id, scope, { incrementalCapabilities: [missingCapability] });

    // Only the missing scope was ever requested — never the full scope list again.
    const secondCall = beginAuthorization.mock.calls[1];
    if (!secondCall) throw new Error('Expected beginAuthorization to have been called a second time.');
    expect((secondCall[2] as { scopesOverride?: string[] } | undefined)?.scopesOverride).toEqual([GMAIL_READONLY_SCOPE]);

    // 5. Now both capabilities resolve as satisfied, and the merged grant covers both.
    const finalGmail = await capabilityRequirementResolver.resolve(
      { kind: 'capability', category: 'productivity', capability: 'listThreads' },
      { scope }
    );
    expect(finalGmail.satisfied).toBe(true);
    const finalCalendar = await capabilityRequirementResolver.resolve(
      { kind: 'capability', category: 'productivity', capability: 'listEvents' },
      { scope }
    );
    expect(finalCalendar.satisfied).toBe(true);

    const stored = await credentialVaultBridge.read(sdk.definition.id, scope);
    expect(stored?.grantedScopes).toEqual(expect.arrayContaining([CALENDAR_SCOPE, GMAIL_READONLY_SCOPE]));
  });
});
