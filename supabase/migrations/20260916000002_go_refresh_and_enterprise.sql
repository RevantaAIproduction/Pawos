-- Go Refresh and Enterprise Billing Schema
-- Implements Phase 2 Active-Time & Device requirements

-- 1. Device Go Refreshes
CREATE TABLE IF NOT EXISTS device_go_refreshes (
  device_fingerprint_hash TEXT PRIMARY KEY,
  refresh_count INTEGER NOT NULL DEFAULT 0 CHECK (refresh_count >= 0 AND refresh_count <= 3),
  last_refresh_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on device_go_refreshes (only accessible via secure RPC)
ALTER TABLE device_go_refreshes ENABLE ROW LEVEL SECURITY;

-- 2. Enterprise Columns on Organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS seat_count INTEGER NOT NULL DEFAULT 1 CHECK (seat_count >= 1),
ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS api_budget_usd NUMERIC NOT NULL DEFAULT 0.0 CHECK (api_budget_usd >= 0);

-- 3. Consume Go Refresh RPC
CREATE OR REPLACE FUNCTION consume_go_refresh(p_device_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count INTEGER;
BEGIN
  -- Insert or get current count
  INSERT INTO device_go_refreshes (device_fingerprint_hash, refresh_count)
  VALUES (p_device_hash, 0)
  ON CONFLICT (device_fingerprint_hash) DO NOTHING;

  -- Lock row for concurrency
  SELECT refresh_count INTO v_current_count
  FROM device_go_refreshes
  WHERE device_fingerprint_hash = p_device_hash
  FOR UPDATE;

  IF v_current_count >= 3 THEN
    RETURN FALSE;
  END IF;

  UPDATE device_go_refreshes
  SET refresh_count = refresh_count + 1,
      last_refresh_at = NOW()
  WHERE device_fingerprint_hash = p_device_hash;

  RETURN TRUE;
END;
$$;
\nCREATE OR REPLACE FUNCTION get_go_refreshes(p_device_hash TEXT)\nRETURNS INTEGER\nLANGUAGE plpgsql\nSECURITY DEFINER\nAS \nDECLARE\n  v_count INTEGER;\nBEGIN\n  SELECT refresh_count INTO v_count FROM device_go_refreshes WHERE device_fingerprint_hash = p_device_hash;\n  RETURN 3 - COALESCE(v_count, 0);\nEND;\n;\n