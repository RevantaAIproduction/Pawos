import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');

describe('Google Workspace connector (disabled until Google verifies the app)', () => {
  it('is not registered, so it is absent from Connections and cannot be connected', () => {
    const main = read('src/main/main.ts');
    expect(main).not.toMatch(/^\s*connectorRegistry\.register\(googleWorkspaceConnectorSDK\)/m);
    expect(main).not.toMatch(/^import \{ googleWorkspaceConnectorSDK \}/m);
    expect(read('src/renderer/ui/Dashboard/SettingsHome.tsx')).not.toContain('connectorId="googleWorkspace"');
  });

  it('Microsoft 365 connector is not registered either (added back in a later release)', () => {
    const main = read('src/main/main.ts');
    expect(main).not.toMatch(/^import \{ microsoftConnectorSDK \}/m);
    expect(main).not.toMatch(/^\s*microsoftConnectorSDK,\s*$/m);
  });
});

describe('connector OAuth endpoints match the providers\' current OAuth servers', () => {
  it('Vercel ("Sign in with Vercel"): PKCE on, code exchanged at /login/oauth/token (desktop + web)', () => {
    const def = read('src/main/connectivity/connectors/VercelConnectorSDK.ts');
    expect(def).toContain("authorizationUrl: 'https://vercel.com/oauth/authorize'");
    expect(def).toContain("tokenUrl: 'https://api.vercel.com/login/oauth/token'");
    expect(def).toMatch(/usePkce: true/);
    expect(read('pawos-web/src/lib/connectivityOAuthProviders.ts')).toContain("'https://api.vercel.com/login/oauth/token'");
  });

  it('Railway: backboard.railway.com /oauth/auth + /oauth/token, with scopes and PKCE (desktop + web)', () => {
    const def = read('src/main/connectivity/connectors/RailwayConnectorSDK.ts');
    expect(def).toContain("authorizationUrl: 'https://backboard.railway.com/oauth/auth'");
    expect(def).toContain("tokenUrl: 'https://backboard.railway.com/oauth/token'");
    expect(def).toMatch(/scopes: \['openid', 'email', 'profile', 'offline_access', 'workspace:member', 'project:member'\]/);
    expect(def).toMatch(/usePkce: true/);
    const web = read('pawos-web/src/lib/connectivityOAuthProviders.ts');
    expect(web).toContain("'https://backboard.railway.com/oauth/token'");
    expect(web).not.toContain('backboard.railway.app/oauth');
  });
});
