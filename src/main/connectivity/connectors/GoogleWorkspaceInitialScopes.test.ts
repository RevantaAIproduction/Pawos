import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '' }, shell: { openExternal: vi.fn() } }));

import { INITIAL_CONNECT_SCOPES } from './GoogleWorkspaceConnectorSDK';

const G = 'https://www.googleapis.com/auth/';

describe('Google Workspace first Connect (unverified-app safe)', () => {
  it('never requests Google RESTRICTED scopes up front (they block the consent screen until approved)', () => {
    expect(INITIAL_CONNECT_SCOPES).not.toContain(`${G}gmail.readonly`);
    expect(INITIAL_CONNECT_SCOPES).not.toContain(`${G}drive.readonly`);
  });

  it('still requests the non-sensitive and sensitive scopes, which work under the 100-user cap', () => {
    for (const scope of ['userinfo.email', 'drive.file', 'calendar', 'contacts.readonly']) {
      expect(INITIAL_CONNECT_SCOPES).toContain(`${G}${scope}`);
    }
  });
});
