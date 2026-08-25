-- Member credit request system for Team/Enterprise organizations

CREATE TABLE IF NOT EXISTS member_credit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requesting_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_amount BIGINT NOT NULL CHECK (requested_amount > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  allocated_amount BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Track member credit allocations separately from pool
CREATE TABLE IF NOT EXISTS member_credit_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocated_credits BIGINT NOT NULL DEFAULT 0 CHECK (allocated_credits >= 0),
  used_credits BIGINT NOT NULL DEFAULT 0 CHECK (used_credits >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, member_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_requests_org ON member_credit_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_user ON member_credit_requests(requesting_user_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON member_credit_requests(status);
CREATE INDEX IF NOT EXISTS idx_allocations_org ON member_credit_allocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_allocations_user ON member_credit_allocations(member_user_id);

-- RLS
ALTER TABLE member_credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_credit_allocations ENABLE ROW LEVEL SECURITY;

-- Members can view their own requests and allocations
CREATE POLICY "members_view_own_requests" ON member_credit_requests
  FOR SELECT
  USING (
    requesting_user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

CREATE POLICY "members_view_own_allocations" ON member_credit_allocations
  FOR SELECT
  USING (
    member_user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

-- Only admins can approve/allocate
CREATE POLICY "admins_manage_requests" ON member_credit_requests
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

CREATE POLICY "admins_manage_allocations" ON member_credit_allocations
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

-- Triggers
CREATE OR REPLACE FUNCTION update_credit_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_credit_requests_updated_at
BEFORE UPDATE ON member_credit_requests
FOR EACH ROW
EXECUTE FUNCTION update_credit_requests_timestamp();

CREATE OR REPLACE FUNCTION update_allocations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_allocations_updated_at
BEFORE UPDATE ON member_credit_allocations
FOR EACH ROW
EXECUTE FUNCTION update_allocations_timestamp();
