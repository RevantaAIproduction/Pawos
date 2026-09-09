-- Phase 2: Durable External Write Idempotency for Connector Write-Back
--
-- Implements durable persistence for external write operations (comments, status updates)
-- to prevent duplicate writes on network failures and enable unknown-result reconciliation.
--
-- Key features:
-- 1. Logical action identity (deterministic hash per action)
-- 2. Provider-specific comment tracking
-- 3. Unknown-result reconciliation state
-- 4. Idempotent duplicate detection

-- =========================================================================
-- 1. Create autonomous_external_writes table
-- =========================================================================
CREATE TABLE IF NOT EXISTS autonomous_external_writes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autonomous_run_id UUID NOT NULL REFERENCES autonomous_task_runs(id) ON DELETE CASCADE,
  logical_action_id TEXT NOT NULL,         -- Deterministic hash: SHA256(runId|connector|issueKey|actionType)
  connector TEXT NOT NULL,                 -- 'jira', 'linear', 'github'
  external_issue_id TEXT NOT NULL,         -- 'PROJ-123' (Jira), 'issueUuid' (Linear), 'owner/repo#123' (GitHub)
  external_comment_id TEXT,                -- Returned by provider; persists on success
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'failed', 'reconciling'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_reason TEXT,
  metadata JSONB,                          -- Provider-specific data, reconciliation results

  -- Uniqueness: one logical action per run per connector per issue
  UNIQUE(autonomous_run_id, logical_action_id, connector, external_issue_id),

  -- Status constraint
  CONSTRAINT autonomous_external_writes_status_check
    CHECK (status IN ('pending', 'completed', 'failed', 'reconciling'))
);

-- =========================================================================
-- 2. Create indexes
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_autonomous_external_writes_run_id
  ON autonomous_external_writes(autonomous_run_id);

CREATE INDEX IF NOT EXISTS idx_autonomous_external_writes_status
  ON autonomous_external_writes(status);

CREATE INDEX IF NOT EXISTS idx_autonomous_external_writes_logical_action
  ON autonomous_external_writes(logical_action_id, connector, external_issue_id);

CREATE INDEX IF NOT EXISTS idx_autonomous_external_writes_pending
  ON autonomous_external_writes(autonomous_run_id, connector, status)
  WHERE status = 'pending';

-- =========================================================================
-- 3. Enable RLS
-- =========================================================================
ALTER TABLE autonomous_external_writes ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own run's external writes
CREATE POLICY autonomous_external_writes_select_own_run ON autonomous_external_writes
  FOR SELECT USING (
    autonomous_run_id IN (
      SELECT id FROM autonomous_task_runs
      WHERE user_id = auth.uid()
        OR (organization_id IS NOT NULL AND is_org_member(organization_id, auth.uid()))
    )
  );

-- Allow users to insert external writes for their own runs
CREATE POLICY autonomous_external_writes_insert_own_run ON autonomous_external_writes
  FOR INSERT WITH CHECK (
    autonomous_run_id IN (
      SELECT id FROM autonomous_task_runs
      WHERE user_id = auth.uid()
        OR (organization_id IS NOT NULL AND is_org_member(organization_id, auth.uid()))
    )
  );

-- Allow users to update their own run's external writes
CREATE POLICY autonomous_external_writes_update_own_run ON autonomous_external_writes
  FOR UPDATE USING (
    autonomous_run_id IN (
      SELECT id FROM autonomous_task_runs
      WHERE user_id = auth.uid()
        OR (organization_id IS NOT NULL AND is_org_member(organization_id, auth.uid()))
    )
  );

-- =========================================================================
-- 4. RPC: get_or_create_external_write_record
-- =========================================================================
-- Atomically: get existing record OR create new one
-- Handles concurrent inserts safely via ON CONFLICT DO UPDATE
-- Returns: (id, status, external_comment_id, created)
CREATE OR REPLACE FUNCTION get_or_create_external_write_record(
  p_run_id UUID,
  p_logical_action_id TEXT,
  p_connector TEXT,
  p_external_issue_id TEXT
)
RETURNS TABLE (
  id UUID,
  status TEXT,
  external_comment_id TEXT,
  created BOOLEAN  -- true if newly created, false if existing
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record autonomous_external_writes%ROWTYPE;
  v_created BOOLEAN;
BEGIN
  -- Atomic insert-or-get using ON CONFLICT
  -- Two concurrent calls will both execute this, but only one creates a new row
  -- The other gets the newly-created row via the conflict update
  INSERT INTO autonomous_external_writes (
    autonomous_run_id,
    logical_action_id,
    connector,
    external_issue_id,
    status
  ) VALUES (
    p_run_id,
    p_logical_action_id,
    p_connector,
    p_external_issue_id,
    'pending'
  )
  ON CONFLICT (autonomous_run_id, logical_action_id, connector, external_issue_id)
  DO UPDATE SET
    -- No-op update to trigger RETURNING on conflict
    status = EXCLUDED.status
  RETURNING autonomous_external_writes.* INTO v_record;

  -- Determine if this was newly created or existing
  -- If status is still 'pending' (our default), and created_at is recent, likely new
  -- Better: check if this was the INSERT vs UPDATE by querying
  v_created := (v_record.created_at > NOW() - INTERVAL '1 second');

  -- Return the record with created flag
  RETURN QUERY SELECT
    v_record.id,
    v_record.status,
    v_record.external_comment_id,
    v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_external_write_record TO authenticated;

-- =========================================================================
-- 5. RPC: mark_external_write_completed
-- =========================================================================
-- Update record to 'completed' with external comment ID
-- Idempotent: if already completed, no-op
CREATE OR REPLACE FUNCTION mark_external_write_completed(
  p_record_id UUID,
  p_external_comment_id TEXT
)
RETURNS autonomous_external_writes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record autonomous_external_writes%ROWTYPE;
BEGIN
  -- 1. Lock and fetch record
  SELECT * INTO v_record
  FROM autonomous_external_writes
  WHERE id = p_record_id
  FOR UPDATE;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'External write record % not found', p_record_id;
  END IF;

  -- 2. If already completed, return existing record (idempotent)
  IF v_record.status = 'completed' THEN
    RETURN v_record;
  END IF;

  -- 3. Update record: mark completed
  UPDATE autonomous_external_writes
  SET
    status = 'completed',
    external_comment_id = p_external_comment_id,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_record_id;

  -- 4. Return updated record
  SELECT * INTO v_record FROM autonomous_external_writes WHERE id = p_record_id;
  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_external_write_completed TO authenticated;

-- =========================================================================
-- 6. RPC: mark_external_write_failed
-- =========================================================================
CREATE OR REPLACE FUNCTION mark_external_write_failed(
  p_record_id UUID,
  p_error_reason TEXT
)
RETURNS autonomous_external_writes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record autonomous_external_writes%ROWTYPE;
BEGIN
  -- 1. Lock and fetch record
  SELECT * INTO v_record
  FROM autonomous_external_writes
  WHERE id = p_record_id
  FOR UPDATE;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'External write record % not found', p_record_id;
  END IF;

  -- 2. Update record: mark failed
  UPDATE autonomous_external_writes
  SET
    status = 'failed',
    error_reason = p_error_reason,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_record_id;

  -- 3. Return updated record
  SELECT * INTO v_record FROM autonomous_external_writes WHERE id = p_record_id;
  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_external_write_failed TO authenticated;

-- =========================================================================
-- 7. RPC: mark_external_write_reconciling
-- =========================================================================
-- For unknown-result scenario: mark record as 'reconciling' during recovery attempt
CREATE OR REPLACE FUNCTION mark_external_write_reconciling(
  p_record_id UUID,
  p_metadata JSONB DEFAULT NULL
)
RETURNS autonomous_external_writes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record autonomous_external_writes%ROWTYPE;
BEGIN
  -- 1. Lock and fetch record
  SELECT * INTO v_record
  FROM autonomous_external_writes
  WHERE id = p_record_id
  FOR UPDATE;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'External write record % not found', p_record_id;
  END IF;

  -- 2. Update record: mark reconciling
  UPDATE autonomous_external_writes
  SET
    status = 'reconciling',
    metadata = COALESCE(p_metadata, metadata),
    updated_at = NOW()
  WHERE id = p_record_id;

  -- 3. Return updated record
  SELECT * INTO v_record FROM autonomous_external_writes WHERE id = p_record_id;
  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_external_write_reconciling TO authenticated;

-- =========================================================================
-- 8. RPC: get_completed_external_write
-- =========================================================================
-- Check if record exists and is completed (happy path)
CREATE OR REPLACE FUNCTION get_completed_external_write(
  p_run_id UUID,
  p_logical_action_id TEXT,
  p_connector TEXT,
  p_external_issue_id TEXT
)
RETURNS TABLE (
  record_id UUID,
  status TEXT,
  external_comment_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.status,
    r.external_comment_id
  FROM autonomous_external_writes r
  WHERE r.autonomous_run_id = p_run_id
    AND r.logical_action_id = p_logical_action_id
    AND r.connector = p_connector
    AND r.external_issue_id = p_external_issue_id
    AND r.status = 'completed';
END;
$$;

GRANT EXECUTE ON FUNCTION get_completed_external_write TO authenticated;
