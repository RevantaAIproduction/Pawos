import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

import { buildConnectorAuthorizedPageUrl } from './OAuthManager';

describe('connector relay landing page (browser leaves 127.0.0.1 for a pawos-web page)', () => {
  it('names the connector and never carries the code or state', () => {
    const url = new URL(buildConnectorAuthorizedPageUrl('vercel', {}));
    expect(url.origin + url.pathname).toBe('https://pawos.revantaai.com/connectors/authorized');
    expect(url.searchParams.get('connector')).toBe('vercel');
    expect(url.searchParams.get('status')).toBe('authorized');
    expect(url.searchParams.has('code')).toBe(false);
    expect(url.searchParams.has('state')).toBe(false);
  });

  it('reports provider errors and stale/duplicate redirects', () => {
    const failed = new URL(buildConnectorAuthorizedPageUrl('gitlab', { error: 'access_denied' }));
    expect(failed.searchParams.get('status')).toBe('error');
    expect(failed.searchParams.get('message')).toBe('access_denied');
    const expired = new URL(buildConnectorAuthorizedPageUrl(undefined, { expired: true }));
    expect(expired.searchParams.get('status')).toBe('expired');
    expect(expired.searchParams.has('connector')).toBe(false);
  });

  it('the pawos-web page it points to exists', () => {
    const page = path.join(__dirname, '../../../pawos-web/src/app/connectors/authorized/page.tsx');
    expect(fs.readFileSync(page, 'utf8')).toContain('ConnectorAuthorizedPage');
  });
});
