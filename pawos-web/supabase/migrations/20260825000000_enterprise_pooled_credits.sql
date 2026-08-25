-- Enterprise Pooled Credits Ledger
-- Tracks organization-wide pooled credit balance and settlement state
-- Separate from individual Pro/Pro Max quotas and other credit types

CREATE TABLE IF NOT EXISTS enterprise_pooled_credits (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Pooled credit capacity and consumption
  pooled_credit_limit BIGINT NOT NULL DEFAULT 70000, -- Month 1: 70k credits
  pooled_credits_consumed BIGINT NOT NULL DEFAULT 0,

  -- Billing cycle tracking (0-based month: 0 = Month 1, etc.)
  current_billing_month INT NOT NULL DEFAULT 0,
  billing_cycle_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Settlement state machine
  -- 'none' = no active settlement
  -- 'pending' = settlement initiated, awaiting payment
  -- 'paid' = settlement confirmed, pool to be replenished
  settlement_status TEXT NOT NULL DEFAULT 'none' CHECK (settlement_status IN ('none', 'pending', 'paid')),

  -- Idempotency: unique settlement identifier (UUID)
  settlement_id UUID UNIQUE,

  -- Razorpay invoice/payment references
  settlement_invoice_ids TEXT[] DEFAULT '{}',

  -- Settlement accounting
  settled_amount_usd DECIMAL(10,2) DEFAULT 0,
  settled_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_pool_limit CHECK (pooled_credit_limit > 0 AND pooled_credit_limit <= 2000000),
  CONSTRAINT valid_consumed CHECK (pooled_credits_consumed >= 0),
  CONSTRAINT valid_consumed_le_limit CHECK (pooled_credits_consumed <= pooled_credit_limit),
  CONSTRAINT valid_billing_month CHECK (current_billing_month >= 0),
  CONSTRAINT valid_settled_amount CHECK (settled_amount_usd >= 0)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_enterprise_pooled_status ON enterprise_pooled_credits(settlement_status);
CREATE INDEX IF NOT EXISTS idx_enterprise_pooled_settlement_id ON enterprise_pooled_credits(settlement_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_pooled_billing_month ON enterprise_pooled_credits(current_billing_month);

-- Settlement audit trail: track all settlement attempts
CREATE TABLE IF NOT EXISTS enterprise_pooled_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Settlement details
  settlement_id UUID NOT NULL, -- References enterprise_pooled_credits.settlement_id for idempotency
  credits_settled BIGINT NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL,
  amount_inr BIGINT NOT NULL, -- Paise (amount_usd * 95.65 * 100)

  -- Payment flow
  payment_route TEXT NOT NULL CHECK (payment_route IN ('normal', 'high-value')),
  razorpay_invoice_ids TEXT[] DEFAULT '{}',

  -- Settlement state
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'paid', 'failed', 'cancelled')),

  -- Payment confirmation
  razorpay_payment_id TEXT,
  payment_verified_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraint: one settlement per organization at a time
  CONSTRAINT single_active_settlement UNIQUE (organization_id, settlement_id)
);

-- Indexes for audit and settlement tracking
CREATE INDEX IF NOT EXISTS idx_settlements_org ON enterprise_pooled_settlements(organization_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON enterprise_pooled_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_settlement_id ON enterprise_pooled_settlements(settlement_id);

-- Enable RLS (Row Level Security) for enterprise_pooled_credits
ALTER TABLE enterprise_pooled_credits ENABLE ROW LEVEL SECURITY;

-- RLS Policy: organization members can view their own pooled credits
CREATE POLICY "view_own_pooled_credits" ON enterprise_pooled_credits
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: only organization admins can update pooled credits
CREATE POLICY "update_own_pooled_credits" ON enterprise_pooled_credits
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

-- Enable RLS for audit table
ALTER TABLE enterprise_pooled_settlements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: organization members can view settlement history
CREATE POLICY "view_own_settlements" ON enterprise_pooled_settlements
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Create trigger to update updated_at on enterprise_pooled_credits
CREATE OR REPLACE FUNCTION update_enterprise_pooled_credits_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enterprise_pooled_credits_updated_at
BEFORE UPDATE ON enterprise_pooled_credits
FOR EACH ROW
EXECUTE FUNCTION update_enterprise_pooled_credits_timestamp();

-- Create trigger to update updated_at on enterprise_pooled_settlements
CREATE OR REPLACE FUNCTION update_enterprise_pooled_settlements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enterprise_pooled_settlements_updated_at
BEFORE UPDATE ON enterprise_pooled_settlements
FOR EACH ROW
EXECUTE FUNCTION update_enterprise_pooled_settlements_timestamp();

-- Seed initial pooled credits for any existing Enterprise orgs
-- (This will be handled by the application layer when Enterprise subscription is first created)
