import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { linearAuthorization } from '../infrastructure/connectors/projectManagement/LinearConnector';
import { postJiraComment } from '../execution/plugins/infrastructure/JiraWriteBackPlugin';

const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('Jira / Linear connector fixes', () => {
  it('Jira requests write:jira-work alongside its read scopes', () => {
    const jira = src('connectivity/connectors/JiraConnectorSDK.ts');
    expect(jira).toMatch(/scopes: \['read:jira-work', 'write:jira-work', 'read:jira-user', 'offline_access'\]/);
  });

  it('Linear requests read + write, comma-separated as Linear expects', () => {
    const linear = src('connectivity/connectors/LinearConnectorSDK.ts');
    expect(linear).toMatch(/scopes: \['read', 'write'\]/);
    expect(linear).toMatch(/scopeSeparator: ',' as const/);
    expect(src('connectivity/OAuthManager.ts')).toContain("join(oauth.scopeSeparator ?? ' ')");
  });

  it('Linear reads send OAuth tokens as Bearer and personal API keys raw', () => {
    expect(linearAuthorization('lin_oauth_abc')).toBe('Bearer lin_oauth_abc');
    expect(linearAuthorization('someOAuthToken')).toBe('Bearer someOAuthToken');
    expect(linearAuthorization('lin_api_xyz')).toBe('lin_api_xyz');
    expect(linearAuthorization('')).toBe('');
  });

  it('Jira comments are posted to /issue/{key}/comment (singular)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '10001' }) });
    vi.stubGlobal('fetch', fetchMock);
    await postJiraComment({ jiraUrl: 'https://api.atlassian.com/ex/jira/cloud-1', apiEmail: 'api@jira', apiToken: 't', issueKey: 'PAW-1', comment: 'done' } as any);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/issue/PAW-1/comment');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });

  it('Linear status lookup reads team states through `nodes`', () => {
    const wb = src('execution/plugins/infrastructure/LinearWriteBackPlugin.ts');
    expect(wb).toMatch(/states \{\s*nodes \{\s*id\s*name/);
    expect(wb).toContain('variables: { id: resolvedIssueId, stateId: targetState.id }');
  });
});
