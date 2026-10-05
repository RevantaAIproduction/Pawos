import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PUBLIC_ENV_DEFAULTS } from './publicEnvDefaults';

const CONNECTORS_DIR = path.join(__dirname, '../connectivity/connectors');
// Every connector ships its client ID and callback URL (none excluded).
const NOT_SHIPPED = new Set<string>();

function connectorEnvVars(kind: 'clientIdEnvVar' | 'redirectUriEnvVar' | 'clientSecretEnvVar'): string[] {
  const names = new Set<string>();
  for (const file of fs.readdirSync(CONNECTORS_DIR).filter((f) => f.endsWith('ConnectorSDK.ts'))) {
    const src = fs.readFileSync(path.join(CONNECTORS_DIR, file), 'utf8');
    for (const m of src.matchAll(new RegExp(`${kind}:\\s*'([A-Z_]+)'`, 'g'))) names.add(m[1]);
  }
  return [...names];
}

describe('PUBLIC_ENV_DEFAULTS (the packaged app has no .env)', () => {
  it('ships every OAuth connector client ID and callback URL, so Connect works in installed builds', () => {
    const needed = [...connectorEnvVars('clientIdEnvVar'), ...connectorEnvVars('redirectUriEnvVar')].filter((k) => !NOT_SHIPPED.has(k));
    expect(needed).toContain('CONNECTOR_JIRA_CLIENT_ID');
    expect(needed).toContain('LINEAR_CLIENT_ID');
    expect(needed).toContain('GITLAB_CLIENT_ID');
    const missing = needed.filter((k) => !PUBLIC_ENV_DEFAULTS[k]);
    expect(missing).toEqual([]);
  });

  it('every website callback is under /api/connectors (the URLs the provider apps are registered with)', () => {
    expect(PUBLIC_ENV_DEFAULTS.CONNECTOR_GITHUB_CALLBACK_URL).toBe('https://pawos.revantaai.com/api/connectivity/oauth/callback/github');
    expect(PUBLIC_ENV_DEFAULTS.CONNECTOR_SLACK_CALLBACK_URL).toBe('https://pawos.revantaai.com/api/connectors/slack/callback');
    expect(PUBLIC_ENV_DEFAULTS.CONNECTOR_MICROSOFT_CALLBACK_URL).toBe('pawos://connectivity-oauth-callback');
    for (const [key, value] of Object.entries(PUBLIC_ENV_DEFAULTS)) {
      if (/CALLBACK_URL$|REDIRECT_URL$/.test(key)) expect(value).not.toContain('/api/connectivity/');
    }
    // The website serves each of them and relays desktop flows back to Electron.
    for (const provider of ['github', 'slack']) {
      const route = path.join(__dirname, `../../../pawos-web/src/app/api/connectors/${provider}/callback/route.ts`);
      expect(fs.readFileSync(route, 'utf8')).toMatch(/relayConnectivityToDesktop|handleConnectorCallback/);
    }
  });

  it('GitLab uses the production app (callback https://pawos.revantaai.com/auth/gitlab/callback), not the localhost dev app', () => {
    expect(PUBLIC_ENV_DEFAULTS.GITLAB_CLIENT_ID).toBe('d22722ceb493803c08bf8782c0505e24db8278744a75f2f6c18713cb204bcfb6');
    expect(PUBLIC_ENV_DEFAULTS.GITLAB_REDIRECT_URL).toBe('https://pawos.revantaai.com/auth/gitlab/callback');
  });

  it('never ships a client secret', () => {
    for (const secretVar of connectorEnvVars('clientSecretEnvVar')) expect(PUBLIC_ENV_DEFAULTS[secretVar]).toBeUndefined();
    expect(Object.keys(PUBLIC_ENV_DEFAULTS).filter((k) => /SECRET|PASSWORD|SERVICE_ROLE|API_KEY/.test(k))).toEqual([]);
  });

  it('keeps Google sign-in and the Google Workspace connector as separate OAuth apps', () => {
    expect(PUBLIC_ENV_DEFAULTS.GOOGLE_CLIENT_ID).toBeTruthy();
    expect(PUBLIC_ENV_DEFAULTS.GOOGLE_WORKSPACE_CLIENT_ID).toBeTruthy();
    expect(PUBLIC_ENV_DEFAULTS.GOOGLE_WORKSPACE_CLIENT_ID).not.toBe(PUBLIC_ENV_DEFAULTS.GOOGLE_CLIENT_ID);
  });
});
