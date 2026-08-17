import { describe, expect, it, vi } from 'vitest';
import { postAutonomousCompletionComment } from './PullRequestEvidenceComment';
import type { SourceControlConnector, ConnectorResult } from '../../shared/infrastructure/InfrastructureTypes';

function makeFakeConnector(overrides: Partial<SourceControlConnector> = {}, configured = true): SourceControlConnector {
  return {
    id: 'github',
    displayName: 'GitHub',
    isConfigured: () => configured,
    listRepositories: async () => ({ ok: true, repos: [] }),
    getFileContent: async () => ({ ok: false, reason: 'not used' }),
    getLatestCommit: async () => ({ ok: false, reason: 'not used' }),
    listPullRequests: async () => ({ ok: true, pullRequests: [] }),
    getPullRequestDiff: async () => ({ ok: false, reason: 'not used' }),
    createPullRequestComment: async (): Promise<ConnectorResult<{ commentUrl?: string }>> => ({ ok: true, commentUrl: 'https://github.com/org/repo/pull/42#comment-1' }),
    ...overrides,
  };
}

describe('postAutonomousCompletionComment', () => {
  it('posts a real comment via the already-connected connector\'s real write capability', async () => {
    const connector = makeFakeConnector();
    const createSpy = vi.spyOn(connector, 'createPullRequestComment');

    const result = await postAutonomousCompletionComment('https://github.com/org/repo/pull/42', 'Ticket resolved.', () => connector);

    expect(result.posted).toBe(true);
    expect(result.commentUrl).toBe('https://github.com/org/repo/pull/42#comment-1');
    expect(createSpy).toHaveBeenCalledWith('org/repo', 42, 'Ticket resolved.');
  });

  it('never fabricates success for an unrecognized URL', async () => {
    const result = await postAutonomousCompletionComment('https://example.com/not-a-pr', 'body', () => undefined);
    expect(result.posted).toBe(false);
    expect(result.reason).toContain('Not a recognized');
  });

  it('honestly reports a disconnected connector rather than pretending success', async () => {
    const result = await postAutonomousCompletionComment('https://github.com/org/repo/pull/42', 'body', () => undefined);
    expect(result.posted).toBe(false);
    expect(result.reason).toContain('not connected');
  });

  it('honestly reports an unconfigured connector even if registered', async () => {
    const connector = makeFakeConnector({}, false);
    const result = await postAutonomousCompletionComment('https://github.com/org/repo/pull/42', 'body', () => connector);
    expect(result.posted).toBe(false);
    expect(result.reason).toContain('not connected');
  });

  it('honestly reports a real API-call failure rather than silently treating it as success', async () => {
    const connector = makeFakeConnector({ createPullRequestComment: async () => ({ ok: false, reason: 'GitHub API returned 403' }) });
    const result = await postAutonomousCompletionComment('https://github.com/org/repo/pull/42', 'body', () => connector);
    expect(result.posted).toBe(false);
    expect(result.reason).toContain('403');
  });

  it('works for a GitLab merge request URL too', async () => {
    const connector = makeFakeConnector({ id: 'gitlab', displayName: 'GitLab' });
    const createSpy = vi.spyOn(connector, 'createPullRequestComment');

    const result = await postAutonomousCompletionComment('https://gitlab.com/group/project/-/merge_requests/7', 'body', () => connector);

    expect(result.posted).toBe(true);
    expect(createSpy).toHaveBeenCalledWith('group/project', 7, 'body');
  });

  it('never throws for the real registry default path when nothing is registered', async () => {
    await expect(postAutonomousCompletionComment('https://github.com/org/repo/pull/1', 'body')).resolves.toEqual(
      expect.objectContaining({ posted: false })
    );
  });
});
