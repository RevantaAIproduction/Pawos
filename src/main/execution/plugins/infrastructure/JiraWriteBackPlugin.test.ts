import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { postJiraComment, transitionJiraIssue, type JiraWriteBackResult } from './JiraWriteBackPlugin';

/**
 * Tests for Jira write-back authentication behavior.
 * Verifies both OAuth (Bearer token) and legacy Basic-auth paths work correctly.
 */

describe('Jira Write-Back Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('postJiraComment', () => {
    describe('with OAuth credentials (Bearer token)', () => {
      it('constructs Bearer authorization header from sentinel email', async () => {
        const mockFetch = vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'comment-123' }),
          } as Response)
        );
        global.fetch = mockFetch;

        const result = await postJiraComment({
          jiraUrl: 'https://api.atlassian.com/ex/jira/cloud-id-123',
          apiEmail: 'api@jira',
          apiToken: 'oauth-token-xyz',
          issueKey: 'PROJ-456',
          comment: 'Test comment',
        });

        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledOnce();
        const call = mockFetch.mock.calls[0];
        const options = call[1] as RequestInit;
        expect(options.headers).toBeDefined();
        const headers = options.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer oauth-token-xyz');
        expect(headers.Authorization).not.toContain('Basic');
      });

      it('returns correct comment ID from OAuth response', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oauth-comment-abc' }),
        } as Response);

        const result = await postJiraComment({
          jiraUrl: 'https://api.atlassian.com/ex/jira/abc',
          apiEmail: 'api@jira',
          apiToken: 'token',
          issueKey: 'ISSUE-1',
          comment: 'msg',
        });

        expect(result.ok).toBe(true);
        expect(result.commentId).toBe('oauth-comment-abc');
      });

      it('handles OAuth comment posting errors correctly', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        } as Response);

        const result = await postJiraComment({
          jiraUrl: 'https://api.atlassian.com/ex/jira/xyz',
          apiEmail: 'api@jira',
          apiToken: 'expired-token',
          issueKey: 'ISSUE-2',
          comment: 'msg',
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('401');
      });
    });

    describe('with legacy Basic-auth credentials', () => {
      it('constructs Basic authorization header from email and token', async () => {
        const mockFetch = vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'comment-789' }),
          } as Response)
        );
        global.fetch = mockFetch;

        const result = await postJiraComment({
          jiraUrl: 'https://myteam.atlassian.net',
          apiEmail: 'user@example.com',
          apiToken: 'basic-auth-token',
          issueKey: 'PROJ-789',
          comment: 'Legacy auth test',
        });

        expect(result.ok).toBe(true);
        const call = mockFetch.mock.calls[0];
        const options = call[1] as RequestInit;
        const headers = options.headers as Record<string, string>;

        const expectedAuth = Buffer.from('user@example.com:basic-auth-token').toString('base64');
        expect(headers.Authorization).toBe(`Basic ${expectedAuth}`);
        expect(headers.Authorization).not.toContain('Bearer');
      });

      it('returns correct comment ID from Basic-auth response', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'basic-comment-def' }),
        } as Response);

        const result = await postJiraComment({
          jiraUrl: 'https://legacy.atlassian.net',
          apiEmail: 'admin@org.com',
          apiToken: 'api-token-old',
          issueKey: 'LEGACY-1',
          comment: 'msg',
        });

        expect(result.ok).toBe(true);
        expect(result.commentId).toBe('basic-comment-def');
      });

      it('handles Basic-auth comment posting errors', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        } as Response);

        const result = await postJiraComment({
          jiraUrl: 'https://legacy.atlassian.net',
          apiEmail: 'noaccess@org.com',
          apiToken: 'token',
          issueKey: 'LEGACY-2',
          comment: 'msg',
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('403');
      });
    });

    it('handles network errors for both auth types', async () => {
      vi.mocked(global.fetch, { partial: true }).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const result = await postJiraComment({
        jiraUrl: 'https://api.atlassian.com/ex/jira/xyz',
        apiEmail: 'api@jira',
        apiToken: 'token',
        issueKey: 'ISSUE-3',
        comment: 'msg',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Network timeout');
    });
  });

  describe('transitionJiraIssue', () => {
    describe('with OAuth credentials (Bearer token)', () => {
      it('constructs Bearer authorization for transition list request', async () => {
        const mockFetch = vi.fn();
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                transitions: [
                  { id: 'done-id', name: 'Done' },
                  { id: 'progress-id', name: 'In Progress' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
          });
        global.fetch = mockFetch;

        const result = await transitionJiraIssue(
          'https://api.atlassian.com/ex/jira/cloud-id',
          'api@jira',
          'oauth-token',
          'PROJ-111',
          'Done'
        );

        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Check first call (list transitions)
        const firstCall = mockFetch.mock.calls[0];
        const firstHeaders = firstCall[1]?.headers as Record<string, string>;
        expect(firstHeaders.Authorization).toBe('Bearer oauth-token');
      });

      it('constructs Bearer authorization for transition execute request', async () => {
        const mockFetch = vi.fn();
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                transitions: [{ id: 'done-id', name: 'Done' }],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
          });
        global.fetch = mockFetch;

        await transitionJiraIssue(
          'https://api.atlassian.com/ex/jira/cloud-id',
          'api@jira',
          'oauth-token',
          'PROJ-222',
          'Done'
        );

        // Check second call (execute transition)
        const secondCall = mockFetch.mock.calls[1];
        const secondHeaders = secondCall[1]?.headers as Record<string, string>;
        expect(secondHeaders.Authorization).toBe('Bearer oauth-token');
      });

      it('handles OAuth transition not found error', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              transitions: [{ id: 'id1', name: 'Other Status' }],
            }),
        });

        const result = await transitionJiraIssue(
          'https://api.atlassian.com/ex/jira/xyz',
          'api@jira',
          'oauth-token',
          'ISSUE-1',
          'NonExistent'
        );

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('NonExistent');
        expect(result.reason).toContain('not found');
      });

      it('handles OAuth transition fetch error', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

        const result = await transitionJiraIssue(
          'https://api.atlassian.com/ex/jira/xyz',
          'api@jira',
          'oauth-token',
          'NONEXISTENT-1',
          'Done'
        );

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('404');
      });
    });

    describe('with legacy Basic-auth credentials', () => {
      it('constructs Basic authorization for transition list request', async () => {
        const mockFetch = vi.fn();
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                transitions: [
                  { id: 'done-id', name: 'Done' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
          });
        global.fetch = mockFetch;

        await transitionJiraIssue(
          'https://legacy.atlassian.net',
          'admin@org.com',
          'api-token',
          'LEGACY-111',
          'Done'
        );

        // Check first call (list transitions)
        const firstCall = mockFetch.mock.calls[0];
        const firstHeaders = firstCall[1]?.headers as Record<string, string>;
        const expectedAuth = Buffer.from('admin@org.com:api-token').toString('base64');
        expect(firstHeaders.Authorization).toBe(`Basic ${expectedAuth}`);
      });

      it('constructs Basic authorization for transition execute request', async () => {
        const mockFetch = vi.fn();
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                transitions: [{ id: 'done-id', name: 'Done' }],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
          });
        global.fetch = mockFetch;

        await transitionJiraIssue(
          'https://legacy.atlassian.net',
          'admin@org.com',
          'api-token',
          'LEGACY-222',
          'Done'
        );

        // Check second call (execute transition)
        const secondCall = mockFetch.mock.calls[1];
        const secondHeaders = secondCall[1]?.headers as Record<string, string>;
        const expectedAuth = Buffer.from('admin@org.com:api-token').toString('base64');
        expect(secondHeaders.Authorization).toBe(`Basic ${expectedAuth}`);
      });

      it('handles Basic-auth transition not found', async () => {
        vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              transitions: [{ id: 'id1', name: 'Other' }],
            }),
        });

        const result = await transitionJiraIssue(
          'https://legacy.atlassian.net',
          'user@org.com',
          'token',
          'LEGACY-1',
          'NotThere'
        );

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('NotThere');
      });
    });

    it('handles network errors for both auth types', async () => {
      vi.mocked(global.fetch, { partial: true }).mockRejectedValueOnce(
        new Error('Connection refused')
      );

      const result = await transitionJiraIssue(
        'https://unreachable.atlassian.net',
        'api@jira',
        'token',
        'ISSUE-1',
        'Done'
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Connection refused');
    });
  });

  describe('Idempotency preservation', () => {
    it('comment result shape matches existing contract for OAuth', async () => {
      vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'cid' }),
      });

      const result = await postJiraComment({
        jiraUrl: 'https://api.atlassian.com/ex/jira/xyz',
        apiEmail: 'api@jira',
        apiToken: 'token',
        issueKey: 'ISSUE-1',
        comment: 'msg',
      });

      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('commentId');
      expect(result.cached).toBeUndefined();
      expect(result.recovered).toBeUndefined();
    });

    it('comment error result shape matches existing contract', async () => {
      vi.mocked(global.fetch, { partial: true }).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const result = await postJiraComment({
        jiraUrl: 'https://api.atlassian.com/ex/jira/xyz',
        apiEmail: 'api@jira',
        apiToken: 'token',
        issueKey: 'ISSUE-1',
        comment: 'msg',
      });

      expect(result).toHaveProperty('ok');
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('transition result shape unchanged for OAuth', async () => {
      vi.mocked(global.fetch, { partial: true })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ transitions: [{ id: 'd', name: 'Done' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await transitionJiraIssue(
        'https://api.atlassian.com/ex/jira/xyz',
        'api@jira',
        'token',
        'ISSUE-1',
        'Done'
      );

      expect(result).toHaveProperty('ok');
      expect(result.ok).toBe(true);
      expect(result).not.toHaveProperty('commentId');
    });
  });
});
