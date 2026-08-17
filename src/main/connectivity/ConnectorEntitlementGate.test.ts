import { afterEach, describe, expect, it, vi } from 'vitest';
import { isConnectorEntitled } from './ConnectorEntitlementGate';
import { subscriptionStore } from '../billing/SubscriptionStore';

/**
 * The pure predicate behind connectivityIpc.ts's server-side connector gate — mirrors the exact
 * matrix requested for the entitlement finalization pass. Reuses the same `vi.spyOn(subscriptionStore,
 * 'get')` mocking convention already established in EntitlementService.test.ts.
 */
describe('ConnectorEntitlementGate — final matrix', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Go: every connector blocked', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    for (const id of ['github', 'gitlab', 'vercel', 'netlify', 'railway', 'slack', 'googleWorkspace', 'jira', 'linear']) {
      expect(isConnectorEntitled(id)).toBe(false);
    }
  });

  it('Pro: GitHub/GitLab/Vercel/Netlify/Railway/Slack/Google Workspace allowed; Jira/Linear blocked', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    for (const id of ['github', 'gitlab', 'vercel', 'netlify', 'railway', 'slack', 'googleWorkspace']) {
      expect(isConnectorEntitled(id)).toBe(true);
    }
    expect(isConnectorEntitled('jira')).toBe(false);
    expect(isConnectorEntitled('linear')).toBe(false);
  });

  it('Pro Max: every connector allowed, including Jira/Linear', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
    for (const id of ['github', 'gitlab', 'vercel', 'netlify', 'railway', 'slack', 'googleWorkspace', 'jira', 'linear']) {
      expect(isConnectorEntitled(id)).toBe(true);
    }
  });

  it('Team: every connector allowed', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'standard' });
    for (const id of ['github', 'gitlab', 'vercel', 'netlify', 'railway', 'slack', 'googleWorkspace', 'jira', 'linear']) {
      expect(isConnectorEntitled(id)).toBe(true);
    }
  });

  it('Enterprise: every connector allowed', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    for (const id of ['github', 'gitlab', 'vercel', 'netlify', 'railway', 'slack', 'googleWorkspace', 'jira', 'linear']) {
      expect(isConnectorEntitled(id)).toBe(true);
    }
  });

  it('an unknown connector id (no CONNECTOR_REQUIRED_FEATURE entry) is honestly unrestricted rather than blocked by default', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    expect(isConnectorEntitled('some-future-connector-not-yet-mapped')).toBe(true);
  });
});
