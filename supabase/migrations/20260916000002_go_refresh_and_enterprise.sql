-- Go Refresh and Enterprise Billing Schema
-- Implements Phase 2 Active-Time & Device requirements

-- 1. Device Go Refreshes (Server-bound device registration)
CREATE TABLE IF NOT EXISTS device_go_refreshes (
  device_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
ADD COLUMN IF NOT EXISTS api_budget_usd NUMERIC NOT NULL DEFAULT 0.0 CHECK (api_budget_usd >= 0),
ADD COLUMN IF NOT EXISTS api_usage_usd NUMERIC NOT NULL DEFAULT 0.0 CHECK (api_usage_usd >= 0);

-- 3. Enterprise Usage Enforcement RPC
CREATE OR REPLACE FUNCTION record_enterprise_api_usage(p_org_id UUID, p_cost_usd NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_budget NUMERIC;
  v_usage NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Not an active member of this organization';
  END IF;

  SELECT tier, api_budget_usd, api_usage_usd
  INTO v_tier, v_budget, v_usage
  FROM organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_tier != 'enterprise' THEN
    RAISE EXCEPTION 'Organization is not on the Enterprise tier';
  END IF;

  IF v_usage + p_cost_usd > v_budget THEN
    RAISE EXCEPTION 'Enterprise API budget exceeded';
  END IF;

  UPDATE organizations
  SET api_usage_usd = api_usage_usd + p_cost_usd
  WHERE id = p_org_id;

  RETURN TRUE;
END;
$$;

-- 4. Consume Go Refresh RPC
CREATE OR REPLACE FUNCTION consume_go_refresh(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER;
  v_device_count INTEGER;
BEGIN
  -- Verify authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert if not exists, enforcing max 3 devices per user
  IF NOT EXISTS (SELECT 1 FROM device_go_refreshes WHERE device_id = p_device_id AND user_id = auth.uid()) THEN
    SELECT count(*) INTO v_device_count FROM device_go_refreshes WHERE user_id = auth.uid();
    IF v_device_count >= 3 THEN
      RAISE EXCEPTION 'Maximum number of registered devices (3) reached for this account.';
    END IF;
    INSERT INTO device_go_refreshes (device_id, user_id, refresh_count)
    VALUES (p_device_id, auth.uid(), 0)
    ON CONFLICT (device_id) DO NOTHING;
  END IF;

  -- Lock row for concurrency
  SELECT refresh_count INTO v_current_count
  FROM device_go_refreshes
  WHERE device_id = p_device_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_current_count IS NULL THEN
    RAISE EXCEPTION 'Device not registered to this user';
  END IF;

  IF v_current_count >= 3 THEN
    RETURN FALSE;
  END IF;

  UPDATE device_go_refreshes
  SET refresh_count = refresh_count + 1,
      last_refresh_at = NOW()
  WHERE device_id = p_device_id AND user_id = auth.uid();

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION get_go_refreshes(p_device_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  SELECT refresh_count INTO v_count FROM device_go_refreshes WHERE device_id = p_device_id AND user_id = auth.uid();
  RETURN 3 - COALESCE(v_count, 0);
END;
$$;