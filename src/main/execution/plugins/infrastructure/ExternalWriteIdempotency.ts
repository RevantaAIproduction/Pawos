import * as crypto from 'crypto';

/**
 * Logical action identity: deterministic hash for deduplication.
 * Same inputs = same hash = same logical action.
 * Format: SHA256(runId|connector|externalIssueId|actionType)
 */
export function computeLogicalActionId(
  runId: string,
  connector: 'jira' | 'linear' | 'github',
  externalIssueId: string,
  actionType: 'completion_comment' | 'status_transition' = 'completion_comment'
): string {
  const preimage = [runId, connector, externalIssueId, actionType].join('|');
  return crypto.createHash('sha256').update(preimage).digest('hex');
}

/**
 * External write record state from Supabase
 */
export interface ExternalWriteRecord {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'reconciling';
  external_comment_id: string | null;
  created: boolean;  // true if newly created, false if existing
}

/**
 * Durable idempotency check and record creation
 * Returns existing record if present, creates new one if not
 */
export async function getOrCreateExternalWriteRecord(
  supabaseClient: any,
  runId: string,
  logicalActionId: string,
  connector: 'jira' | 'linear' | 'github',
  externalIssueId: string
): Promise<ExternalWriteRecord> {
  const { data, error } = await supabaseClient.rpc(
    'get_or_create_external_write_record',
    {
      p_run_id: runId,
      p_logical_action_id: logicalActionId,
      p_connector: connector,
      p_external_issue_id: externalIssueId,
    }
  );

  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No record returned from RPC');

  return {
    id: data[0].id,
    status: data[0].status,
    external_comment_id: data[0].external_comment_id,
    created: data[0].created,
  };
}

/**
 * Check if a record already exists and is completed (happy path)
 */
export async function getCompletedExternalWrite(
  supabaseClient: any,
  runId: string,
  logicalActionId: string,
  connector: 'jira' | 'linear' | 'github',
  externalIssueId: string
): Promise<{ recordId: string; commentId: string } | null> {
  const { data, error } = await supabaseClient.rpc(
    'get_completed_external_write',
    {
      p_run_id: runId,
      p_logical_action_id: logicalActionId,
      p_connector: connector,
      p_external_issue_id: externalIssueId,
    }
  );

  if (error) throw error;
  if (!data || data.length === 0) return null;

  return {
    recordId: data[0].record_id,
    commentId: data[0].external_comment_id,
  };
}

/**
 * Mark record as completed with external comment ID
 */
export async function markExternalWriteCompleted(
  supabaseClient: any,
  recordId: string,
  externalCommentId: string
): Promise<void> {
  const { error } = await supabaseClient.rpc(
    'mark_external_write_completed',
    {
      p_record_id: recordId,
      p_external_comment_id: externalCommentId,
    }
  );

  if (error) throw error;
}

/**
 * Mark record as failed with error reason
 */
export async function markExternalWriteFailed(
  supabaseClient: any,
  recordId: string,
  errorReason: string
): Promise<void> {
  const { error } = await supabaseClient.rpc(
    'mark_external_write_failed',
    {
      p_record_id: recordId,
      p_error_reason: errorReason,
    }
  );

  if (error) throw error;
}

/**
 * Mark record as reconciling (unknown-result scenario)
 */
export async function markExternalWriteReconciling(
  supabaseClient: any,
  recordId: string,
  metadata?: Record<string, any>
): Promise<void> {
  const { error } = await supabaseClient.rpc(
    'mark_external_write_reconciling',
    {
      p_record_id: recordId,
      p_metadata: metadata || null,
    }
  );

  if (error) throw error;
}
