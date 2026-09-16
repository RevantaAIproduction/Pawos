-- 20260916000003_enterprise_authoritative_billing.sql

-- Replace the untrusted costUsd parameter with the trusted compute unit (Paw Compute)
-- This ensures the server natively derives the financial cost (1000 Normalized Compute = $1)
-- without trusting a renderer's arbitrary financial calculation.

CREATE OR REPLACE FUNCTION record_enterprise_api_usage(p_org_id UUID, p_normalized_compute NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_tier TEXT;
  v_budget NUMERIC;
  v_usage NUMERIC;
  v_cost_usd NUMERIC;
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

  -- Derive the USD cost authoritatively on the server based on the PawOS configuration semantic (1000 Normalized Compute = 1 USD).
  v_cost_usd := p_normalized_compute / 1000.0;

  IF v_usage + v_cost_usd > v_budget THEN
    RAISE EXCEPTION 'Enterprise API budget exceeded';
  END IF;

  UPDATE organizations
  SET api_usage_usd = api_usage_usd + v_cost_usd
  WHERE id = p_org_id;

  RETURN TRUE;
END;
$body$;


