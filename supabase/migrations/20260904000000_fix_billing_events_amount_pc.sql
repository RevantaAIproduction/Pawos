-- Fix Phase 3: Add missing amount_pc column to organization_billing_events
--
-- Root cause: Settlement RPC (settle_autonomous_task_run_pc) in migration 20260903
-- tries to INSERT amount_pc but the column doesn't exist in the table schema.
--
-- The table was created in 20260723 with amount_usd only.
-- Phase 3 RPC needs both amount_usd (USD) and amount_pc (Autonomous PC) for
-- proper accounting tracking.

ALTER TABLE organization_billing_events
ADD COLUMN IF NOT EXISTS amount_pc INTEGER;

-- Not NOT NULL because:
-- 1. Historical billing_event rows (from 20260723 create) won't have it
-- 2. Only new Phase 3 settlements populate this column
-- 3. Query filters and accounting logic should handle NULL gracefully
