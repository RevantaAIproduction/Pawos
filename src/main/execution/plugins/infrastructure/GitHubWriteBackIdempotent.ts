import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeLogicalActionId,
  getOrCreateExternalWriteRecord,
  getCompletedExternalWrite,
  markExternalWriteCompleted,
  markExternalWriteFailed,
  markExternalWriteReconciling,
} from './ExternalWriteIdempotency';
import { reconcileGitHubComment } from './ProviderReconciliation';
import { parsePullRequestUrl } from '../../../connectivity/PullRequestVerification';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';

export interface IdempotentGitHubCommentInput {
  runId: string;
  prUrl: string;
  comment: string;
}

export interface GitHubWriteBackResult {
  ok: boolean;
  commentUrl?: string;
  reason?: string;
  cached?: boolean;          // true if result was from cache (idempotent)
  recovered?: boolean;       // true if comment ID was recovered via reconciliation
  retryable?: boolean;       // true if error is retryable
}

/**
 * Idempotent GitHub comment posting with durable persistence and unknown-result recovery.
 *
 * Flow:
 * 1. Check if record with same logical action ID already exists and is completed
 *    → Return cached comment URL (skip external call)
 * 2. If record doesn't exist, create new record, then attempt
 * 3. On success: mark completed with comment URL
 * 4. On network error (unknown result): mark reconciling, attempt recovery
 * 5. On API error: mark failed
 */
export async function postGitHubCommentIdempotent(
  supabaseClient: SupabaseClient,
  input: IdempotentGitHubCommentInput,
  getConnector = (connectorId: string) => infrastructureConnectorRegistry.get('sourceControl', connectorId)
): Promise<GitHubWriteBackResult> {
  try {
    // Parse PR URL to get repo and PR number
    const parsed = parsePullRequestUrl(input.prUrl);
    if (!parsed) {
      return {
        ok: false,
        reason: 'Not a recognized GitHub or GitLab pull/merge request URL.',
      };
    }

    // Only handle GitHub (GitLab not in scope for Phase 2)
    if (parsed.connectorId !== 'github') {
      return {
        ok: false,
        reason: 'GitLab write-back idempotency not implemented in Phase 2 (deferred).',
      };
    }

    const logicalActionId = computeLogicalActionId(
      input.runId,
      'github',
      `${parsed.repo}#${parsed.number}`,
      'completion_comment'
    );

    // 1. Check for existing completed record (happy path)
    const completed = await getCompletedExternalWrite(
      supabaseClient,
      input.runId,
      logicalActionId,
      'github',
      `${parsed.repo}#${parsed.number}`
    );

    if (completed) {
      // Record already completed: return cached result
      return {
        ok: true,
        commentUrl: completed.commentId,  // Stored as comment ID for GitHub
        cached: true,
      };
    }

    // 2. Get or create record (starts in 'pending' state)
    const record = await getOrCreateExternalWriteRecord(
      supabaseClient,
      input.runId,
      logicalActionId,
      'github',
      `${parsed.repo}#${parsed.number}`
    );

    // 2b. Concurrency safety: if another caller created this record,
    // they own the external operation. Wait for completion.
    if (!record.created) {
      // Another concurrent caller is handling this action
      // Check if already completed (unlikely but possible if very fast)
      if (record.status === 'completed' && record.external_comment_id) {
        return {
          ok: true,
          commentUrl: record.external_comment_id,
          cached: true,
        };
      }
      // In progress: fail safely and let caller retry
      return {
        ok: false,
        reason: 'Another concurrent operation is handling this external write. Retry to get result.',
        retryable: true,
      };
    }

    // 3. Only THIS caller executes the external write (we created the record)
    const connector = getConnector(parsed.connectorId);
    if (!connector || !connector.isConfigured()) {
      await markExternalWriteFailed(
        supabaseClient,
        record.id,
        'GitHub connector not configured'
      );
      return {
        ok: false,
        reason: 'GitHub is not connected.',
      };
    }

    let apiResult;
    try {
      apiResult = await connector.createPullRequestComment(parsed.repo, parsed.number, input.comment);
    } catch (err) {
      // Network error (unknown result): attempt reconciliation
      await markExternalWriteReconciling(
        supabaseClient,
        record.id,
        {
          error: err instanceof Error ? err.message : String(err),
          attemptedAt: new Date().toISOString(),
        }
      );

      // Try to recover comment ID via reconciliation
      // Extract token from connector for GitHub API
      const connectorConfig = (connector as any).credential;
      const githubToken = connectorConfig?.token;

      if (!githubToken) {
        return {
          ok: false,
          reason: `Network error (unknown result, cannot reconcile without token): ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
        };
      }

      const [owner, repo] = parsed.repo.split('/');
      if (!owner || !repo) {
        return {
          ok: false,
          reason: 'Invalid GitHub repository format.',
          retryable: false,
        };
      }

      const reconciliation = await reconcileGitHubComment(
        githubToken,
        owner,
        repo,
        parsed.number,
        input.comment,
        120  // 120 second window
      );

      if (reconciliation.found && reconciliation.commentId) {
        // Comment found during reconciliation: mark completed
        await markExternalWriteCompleted(
          supabaseClient,
          record.id,
          reconciliation.commentId
        );
        return {
          ok: true,
          commentUrl: `https://github.com/${parsed.repo}/issues/${parsed.number}#issuecomment-${reconciliation.commentId}`,
          recovered: true,
        };
      }

      // Could not recover: mark as unknown, let caller retry
      return {
        ok: false,
        reason: `Network error (unknown result): ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      };
    }

    // 4. Process external write result
    if (apiResult.ok && apiResult.commentUrl) {
      // Success: mark completed and cache comment URL
      await markExternalWriteCompleted(
        supabaseClient,
        record.id,
        apiResult.commentUrl
      );
      return {
        ok: true,
        commentUrl: apiResult.commentUrl,
      };
    } else {
      // API error: mark failed
      const errorReason = apiResult.ok === false ? (apiResult.reason || 'Unknown error') : 'Unknown error';
      await markExternalWriteFailed(
        supabaseClient,
        record.id,
        errorReason
      );
      return {
        ok: false,
        reason: errorReason,
      };
    }
  } catch (err) {
    // Unexpected error: return error result
    return {
      ok: false,
      reason: `Idempotency system error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
