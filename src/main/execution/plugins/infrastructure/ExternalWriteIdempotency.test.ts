import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeLogicalActionId,
  getOrCreateExternalWriteRecord,
  getCompletedExternalWrite,
  markExternalWriteCompleted,
  markExternalWriteFailed,
} from './ExternalWriteIdempotency';

describe('ExternalWriteIdempotency', () => {
  const mockRunId = 'run-123';
  const mockSupabaseClient = {
    rpc: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeLogicalActionId', () => {
    it('Scenario 1: Logical action identity determinism', () => {
      // Two calls with same inputs should produce identical hash
      const id1 = computeLogicalActionId(mockRunId, 'jira', 'PROJ-123', 'completion_comment');
      const id2 = computeLogicalActionId(mockRunId, 'jira', 'PROJ-123', 'completion_comment');

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{64}$/);  // SHA256 hex
    });

    it('Different inputs produce different hashes', () => {
      const id1 = computeLogicalActionId(mockRunId, 'jira', 'PROJ-123', 'completion_comment');
      const id2 = computeLogicalActionId(mockRunId, 'jira', 'PROJ-456', 'completion_comment');
      const id3 = computeLogicalActionId(mockRunId, 'linear', 'PROJ-123', 'completion_comment');

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id2).not.toBe(id3);
    });
  });

  describe('getOrCreateExternalWriteRecord', () => {
    it('Scenario 2: Record creation on first call', async () => {
      const newRecordId = 'record-456';
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          id: newRecordId,
          status: 'pending',
          external_comment_id: null,
          created: true,
        }],
        error: null,
      });

      const result = await getOrCreateExternalWriteRecord(
        mockSupabaseClient,
        mockRunId,
        'action-id-1',
        'jira',
        'PROJ-123'
      );

      expect(result.id).toBe(newRecordId);
      expect(result.status).toBe('pending');
      expect(result.external_comment_id).toBeNull();
      expect(result.created).toBe(true);
    });

    it('Scenario 3: Existing record returned on retry', async () => {
      const existingRecordId = 'record-789';
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          id: existingRecordId,
          status: 'completed',
          external_comment_id: 'comment-999',
          created: false,
        }],
        error: null,
      });

      const result = await getOrCreateExternalWriteRecord(
        mockSupabaseClient,
        mockRunId,
        'action-id-1',
        'jira',
        'PROJ-123'
      );

      expect(result.id).toBe(existingRecordId);
      expect(result.status).toBe('completed');
      expect(result.external_comment_id).toBe('comment-999');
      expect(result.created).toBe(false);
    });
  });

  describe('getCompletedExternalWrite', () => {
    it('Scenario 4: Completed record found (cache hit)', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          record_id: 'record-123',
          status: 'completed',
          external_comment_id: 'jira-comment-456',
        }],
        error: null,
      });

      const result = await getCompletedExternalWrite(
        mockSupabaseClient,
        mockRunId,
        'action-id-1',
        'jira',
        'PROJ-123'
      );

      expect(result).not.toBeNull();
      expect(result?.recordId).toBe('record-123');
      expect(result?.commentId).toBe('jira-comment-456');
    });

    it('Scenario 5: No completed record found (cache miss)', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await getCompletedExternalWrite(
        mockSupabaseClient,
        mockRunId,
        'action-id-1',
        'jira',
        'PROJ-123'
      );

      expect(result).toBeNull();
    });
  });

  describe('markExternalWriteCompleted', () => {
    it('Scenario 6: Record marked completed with comment ID', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        markExternalWriteCompleted(mockSupabaseClient, 'record-123', 'jira-comment-789')
      ).resolves.toBeUndefined();

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'mark_external_write_completed',
        {
          p_record_id: 'record-123',
          p_external_comment_id: 'jira-comment-789',
        }
      );
    });
  });

  describe('markExternalWriteFailed', () => {
    it('Scenario 7: Record marked failed with error reason', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        markExternalWriteFailed(mockSupabaseClient, 'record-123', 'API returned 401')
      ).resolves.toBeUndefined();

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'mark_external_write_failed',
        {
          p_record_id: 'record-123',
          p_error_reason: 'API returned 401',
        }
      );
    });
  });

  describe('Integration scenarios', () => {
    it('Scenario 8: Full flow — create, attempt, mark completed', async () => {
      const logicalActionId = computeLogicalActionId(mockRunId, 'jira', 'PROJ-123', 'completion_comment');

      // Step 1: Create record
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          id: 'record-123',
          status: 'pending',
          external_comment_id: null,
          created: true,
        }],
        error: null,
      });

      const record = await getOrCreateExternalWriteRecord(
        mockSupabaseClient,
        mockRunId,
        logicalActionId,
        'jira',
        'PROJ-123'
      );

      expect(record.created).toBe(true);
      expect(record.status).toBe('pending');

      // Step 2: Check for existing (should find none on pending)
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const completed = await getCompletedExternalWrite(
        mockSupabaseClient,
        mockRunId,
        logicalActionId,
        'jira',
        'PROJ-123'
      );

      expect(completed).toBeNull();

      // Step 3: Mark completed after successful API call
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await markExternalWriteCompleted(mockSupabaseClient, record.id, 'jira-comment-999');

      // Step 4: Retry should find completed record
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: [{
          record_id: record.id,
          status: 'completed',
          external_comment_id: 'jira-comment-999',
        }],
        error: null,
      });

      const completedRetry = await getCompletedExternalWrite(
        mockSupabaseClient,
        mockRunId,
        logicalActionId,
        'jira',
        'PROJ-123'
      );

      expect(completedRetry).not.toBeNull();
      expect(completedRetry?.commentId).toBe('jira-comment-999');
    });
  });
});
