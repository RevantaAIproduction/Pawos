import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeLogicalActionId,
  getOrCreateExternalWriteRecord,
  getCompletedExternalWrite,
  markExternalWriteCompleted,
  markExternalWriteFailed,
  markExternalWriteReconciling,
} from './ExternalWriteIdempotency';
import { reconcileLinearComment } from './ProviderReconciliation';
import { postLinearComment, type LinearCommentInput, type LinearWriteBackResult } from './LinearWriteBackPlugin';

export interface IdempotentLinearCommentInput {
  runId: string;
  linearApiKey: string;
  issueId: string;
  comment: string;
}

/**
 * Idempotent Linear comment posting with durable persistence and unknown-result recovery.
 *
 * Flow:
 * 1. Check if record with same logical action ID already exists and is completed
 *    → Return cached comment ID (skip external call)
 * 2. If record exists but is pending/failed, re-attempt the external write
 * 3. If record doesn't exist, create new record, then attempt
 * 4. On success: mark completed with comment ID
 * 5. On network error (unknown result): mark reconciling, attempt recovery
 * 6. On API error: mark failed
 */
export async function postLinearCommentIdempotent(
  supabaseClient: SupabaseClient,
  input: IdempotentLinearCommentInput
): Promise<LinearWriteBackResult> {
  const logicalActionId = computeLogicalActionId(
    input.runId,
    'linear',
    input.issueId,
    'completion_comment'
  );

  try {
    // 1. Check for existing completed record (happy path)
    const completed = await getCompletedExternalWrite(
      supabaseClient,
      input.runId,
      logicalActionId,
      'linear',
      input.issueId
    );

    if (completed) {
      // Record already completed: return cached result
      return {
        ok: true,
        commentId: completed.commentId,
        cached: true,
      };
    }

    // 2. Get or create record (starts in 'pending' state)
    const record = await getOrCreateExternalWriteRecord(
      supabaseClient,
      input.runId,
      logicalActionId,
      'linear',
      input.issueId
    );

    // 2b. Concurrency safety: if another caller created this record,
    // they own the external operation. Wait for completion.
    if (!record.created) {
      // Another concurrent caller is handling this action
      // Check if already completed (unlikely but possible if very fast)
      if (record.status === 'completed' && record.external_comment_id) {
        return {
          ok: true,
          commentId: record.external_comment_id,
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
    let result: LinearWriteBackResult;
    try {
      result = await postLinearComment({
        linearApiKey: input.linearApiKey,
        issueId: input.issueId,
        comment: input.comment,
      });
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
      const reconciliation = await reconcileLinearComment(
        input.linearApiKey,
        input.issueId,
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
          commentId: reconciliation.commentId,
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
    if (result.ok && result.commentId) {
      // Success: mark completed and cache comment ID
      await markExternalWriteCompleted(
        supabaseClient,
        record.id,
        result.commentId
      );
      return {
        ok: true,
        commentId: result.commentId,
      };
    } else {
      // API error: mark failed
      await markExternalWriteFailed(
        supabaseClient,
        record.id,
        result.reason || 'Unknown error'
      );
      return result;
    }
  } catch (err) {
    // Unexpected error: return error result
    return {
      ok: false,
      reason: `Idempotency system error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
