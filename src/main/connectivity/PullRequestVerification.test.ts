import { describe, expect, it, vi } from 'vitest';
import { parsePullRequestUrl, verifyPullRequestExists } from './PullRequestVerification';
import type { SourceControlConnector, ConnectorResult, InfraPullRequest } from '../../shared/infrastructure/InfrastructureTypes';

function makeFakeConnector(pullRequests: InfraPullRequest[], configured = true): SourceControlConnector {
  return {
    id: 'github',
    displayName: 'GitHub',
    isConfigured: () => configured,
    listRepositories: async () => ({ ok: true, repos: [] }),
    getFileContent: async () => ({ ok: false, reason: 'not used' }),
    getLatestCommit: async () => ({ ok: false, reason: 'not used' }),
    listPullRequests: async (): Promise<ConnectorResult<{ pullRequests: InfraPullRequest[] }>> => ({ ok: true, pullRequests }),
    getPullRequestDiff: async () => ({ ok: false, reason: 'not used' }),
    createPullRequestComment: async () => ({ ok: false, reason: 'not used' }),
  };
}

describe('parsePullRequestUrl', () => {
  it('parses a real GitHub PR URL', () => {
    expect(parsePullRequestUrl('https://github.com/org/repo/pull/42')).toEqual({ connectorId: 'github', repo: 'org/repo', number: 42 });
  });

  it('parses a real GitLab merge request URL', () => {
    expect(parsePullRequestUrl('https://gitlab.com/group/subgroup/project/-/merge_requests/7')).toEqual({
      connectorId: 'gitlab',
      repo: 'group/subgroup/project',
      number: 7,
    });
  });

  it('returns null for an unrecognized host', () => {
    expect(parsePullRequestUrl('https://bitbucket.org/org/repo/pull-requests/1')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parsePullRequestUrl('not a url at all')).toBeNull();
  });

  it('returns null for a GitHub URL that is not a pull request link', () => {
    expect(parsePullRequestUrl('https://github.com/org/repo/issues/42')).toBeNull();
  });
});

describe('verifyPullRequestExists', () => {
  it('confirms a real PR that the connector actually returns', async () => {
    const prUrl = 'https://github.com/org/repo/pull/42';
    const connector = makeFakeConnector([{ number: 42, title: 'Fix bug', author: 'paw', headBranch: 'fix', baseBranch: 'main', url: prUrl, state: 'open' }]);

    const result = await verifyPullRequestExists(prUrl, () => connector);

    expect(result.verified).toBe(true);
  });

  it('never fabricates verification for a PR the connector does not actually list', async () => {
    const connector = makeFakeConnector([]);

    const result = await verifyPullRequestExists('https://github.com/org/repo/pull/42', () => connector);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('No pull/merge request');
  });

  it('honestly reports an unrecognized URL as unverifiable, never throws', async () => {
    const result = await verifyPullRequestExists('https://example.com/not-a-pr', () => undefined);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Not a recognized');
  });

  it('honestly reports a disconnected connector as unverifiable', async () => {
    const result = await verifyPullRequestExists('https://github.com/org/repo/pull/42', () => undefined);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('not connected');
  });

  it('honestly reports an unconfigured connector as unverifiable even if registered', async () => {
    const connector = makeFakeConnector([], false);

    const result = await verifyPullRequestExists('https://github.com/org/repo/pull/42', () => connector);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('not connected');
  });

  it('honestly reports a real connector-read failure rather than silently treating it as "not found"', async () => {
    const connector: SourceControlConnector = {
      ...makeFakeConnector([]),
      listPullRequests: async () => ({ ok: false, reason: 'GitHub API returned 500' }),
    };

    const result = await verifyPullRequestExists('https://github.com/org/repo/pull/42', () => connector);

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Could not reach');
  });

  it('requires an exact URL match, not just a matching PR number in a different repo', async () => {
    const connector = makeFakeConnector([
      { number: 42, title: 'Different repo', author: 'someone', headBranch: 'x', baseBranch: 'main', url: 'https://github.com/other/repo/pull/42', state: 'open' },
    ]);

    const result = await verifyPullRequestExists('https://github.com/org/repo/pull/42', () => connector);

    expect(result.verified).toBe(false);
  });

  it('never throws for the real registry default path when nothing is registered', async () => {
    await expect(verifyPullRequestExists('https://github.com/org/repo/pull/1')).resolves.toEqual(
      expect.objectContaining({ verified: false })
    );
  });
});
